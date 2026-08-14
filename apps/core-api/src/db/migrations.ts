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
];
