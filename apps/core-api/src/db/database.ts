import { chmodSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { migrations, type Migration } from "./migrations.js";

export interface AppliedMigration {
  version: number;
  name: string;
}

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

/**
 * Opens the database and leaves the schema alone.
 *
 * Opening and migrating are two gestures rather than one (ADR 0014): an
 * instance that must back itself up before applying migrations needs a moment
 * in which it knows there is work to do and has not yet done it.
 */
export function openConnection(dataDir: string): DatabaseSync {
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

  return database;
}

/**
 * Opens the database and brings the schema up to date in one gesture.
 *
 * Fine wherever there is nothing to protect — tests, tools working on a
 * throwaway directory. A running instance goes through `prepareDatabase()`
 * instead, which backs itself up first when there are migrations to apply.
 */
export function openDatabase(
  dataDir: string,
  list: readonly Migration[] = migrations,
): DatabaseSync {
  const database = openConnection(dataDir);

  runMigrations(database, list);

  return database;
}

export interface SchemaState {
  /** Highest migration recorded as applied; 0 when the schema does not exist yet. */
  currentVersion: number;
  pending: readonly Migration[];
  /**
   * True when this database has never been migrated. It is what tells a first
   * boot apart from an upgrade: on a brand new database everything is pending,
   * and there is nothing to protect (ADR 0014, punto 3).
   */
  fresh: boolean;
}

/**
 * Reads what has been applied **without creating anything**.
 *
 * Deliberately does not create `schema_migrations`: the absence of that table
 * is the signal that this is a new database, and a read that quietly wrote
 * would destroy the only evidence available.
 */
export function readSchemaState(
  database: DatabaseSync,
  list: readonly Migration[] = migrations,
): SchemaState {
  const applied = hasTable(database, "schema_migrations")
    ? new Set(
        database
          .prepare("SELECT version FROM schema_migrations")
          .all()
          .map((row) => Number((row as { version: number }).version)),
      )
    : new Set<number>();

  return {
    currentVersion: applied.size === 0 ? 0 : Math.max(...applied),
    fresh: applied.size === 0,
    pending: list.filter((migration) => !applied.has(migration.version)),
  };
}

export function hasTable(database: DatabaseSync, name: string): boolean {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined
  );
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

export function runMigrations(
  database: DatabaseSync,
  list: readonly Migration[] = migrations,
): AppliedMigration[] {
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

  for (const migration of list) {
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
