/**
 * Forward-only, versioned migrations.
 *
 * Rules that hold for every migration added here, from ADR 0002:
 * - primary keys are opaque identifiers, never derived from a username or a domain;
 * - timestamps are ISO-8601 strings in UTC;
 * - content tables carry an explicit scope defaulting to `local`;
 * - deletions that federation will need to announce are soft.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "instance",
    statements: [
      // `singleton` is pinned to 1 and unique, so the table can hold at most one row.
      `CREATE TABLE instance (
         id TEXT PRIMARY KEY NOT NULL,
         name TEXT NOT NULL,
         description TEXT NOT NULL DEFAULT '',
         public_key TEXT NOT NULL,
         created_at TEXT NOT NULL,
         singleton INTEGER NOT NULL DEFAULT 1 CHECK (singleton = 1) UNIQUE
       ) STRICT`,
    ],
  },
  {
    version: 2,
    name: "accounts-and-sessions",
    statements: [
      // `username` is unique but is never an identity: rows are referenced by
      // `id` only, so a rename never breaks a relationship (ADR 0002).
      `CREATE TABLE users (
         id TEXT PRIMARY KEY NOT NULL,
         username TEXT NOT NULL,
         display_name TEXT NOT NULL,
         password_hash TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('instance_admin', 'instance_moderator', 'member')),
         created_at TEXT NOT NULL,
         deleted_at TEXT
       ) STRICT`,
      // Stored lower-cased, so `Marco` cannot coexist with `marco`.
      `CREATE UNIQUE INDEX users_username_unique ON users (username)`,
      // Only the hash of a session token is stored: reading the database must
      // not yield a usable credential (SECURITY_BASELINE §3).
      `CREATE TABLE sessions (
         id TEXT PRIMARY KEY NOT NULL,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         token_hash TEXT NOT NULL,
         device_label TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL,
         last_seen_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         revoked_at TEXT
       ) STRICT`,
      `CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash)`,
      `CREATE INDEX sessions_user_id ON sessions (user_id)`,
    ],
  },
];
