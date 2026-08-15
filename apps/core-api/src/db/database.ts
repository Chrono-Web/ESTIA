import { chmodSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { migrations, type Migration } from "./migrations.js";

export interface AppliedMigration {
  version: number;
  name: string;
}

/**
 * Opens the instance database, enforces the pragmas the domain relies on, and
 * brings the schema up to date. Safe to call on every boot.
 */
/**
 * Tightens the data directory to 0700, and says whether it managed.
 *
 * The mode passed to `mkdir` applies only when the directory is created, so a
 * directory that already exists keeps whatever permissions it had. That is the
 * normal case under Docker — the image creates `/data`, or an administrator
 * points a bind mount at it — and it is exactly where the decision in
 * SECURITY_BASELINE §4 was quietly not being applied.
 *
 * A failure is not fatal: a network share may refuse `chmod` altogether. It is
 * reported instead, because a protection that is not there must not be assumed.
 */
export function secureDataDirectory(dataDir: string): boolean {
  try {
    chmodSync(dataDir, 0o700);
  } catch {
    // Reported through the return value below, from what the filesystem says
    // rather than from what the call appeared to do.
  }

  try {
    return (statSync(dataDir).mode & 0o777) === 0o700;
  } catch {
    return false;
  }
}

export function openDatabase(dataDir: string): DatabaseSync {
  // 0700: the directory holds the database, the instance private key and,
  // from M2.3, the photographs of the members.
  mkdirSync(dataDir, { mode: 0o700, recursive: true });
  secureDataDirectory(dataDir);

  const databasePath = path.join(dataDir, "estia.db");
  const database = new DatabaseSync(databasePath);

  // 0600 before the first write: from M1.2 this file holds password hashes and
  // session material (SECURITY_BASELINE §4). SQLite gives the -wal and -shm
  // files the permissions of the main database file, so this must come first.
  chmodSync(databasePath, 0o600);

  // Durability and concurrency for a single-process instance.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA synchronous = NORMAL");
  // Foreign keys are off by default in SQLite and must be enabled per connection.
  database.exec("PRAGMA foreign_keys = ON");

  runMigrations(database);

  return database;
}

/**
 * Port for grouping writes that must succeed or fail together. The domain
 * depends on this shape, not on SQLite (ARCHITECTURE §4).
 */
export type Transactor = <T>(work: () => T) => T;

export function createTransactor(database: DatabaseSync): Transactor {
  return function transaction<T>(work: () => T): T {
    database.exec("BEGIN");

    try {
      const result = work();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
}

export function runMigrations(database: DatabaseSync): AppliedMigration[] {
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY NOT NULL,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL
     ) STRICT`,
  );

  const known = new Set(
    database
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => Number((row as { version: number }).version)),
  );

  const applied: AppliedMigration[] = [];

  for (const migration of migrations) {
    if (known.has(migration.version)) {
      continue;
    }

    apply(database, migration);
    applied.push({ name: migration.name, version: migration.version });
  }

  return applied;
}

function apply(database: DatabaseSync, migration: Migration): void {
  database.exec("BEGIN");

  try {
    for (const statement of migration.statements) {
      database.exec(statement);
    }

    database
      .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
      .run(migration.version, migration.name, new Date().toISOString());

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
