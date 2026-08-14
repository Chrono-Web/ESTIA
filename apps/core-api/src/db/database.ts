import { chmodSync, mkdirSync } from "node:fs";
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
export function openDatabase(dataDir: string): DatabaseSync {
  // 0700: the directory holds the database and the instance private key.
  mkdirSync(dataDir, { mode: 0o700, recursive: true });

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
