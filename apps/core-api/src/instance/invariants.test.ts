import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";

/**
 * Guards the domain invariants of ADR 0002: the properties that keep a future
 * ActivityPub mapping possible without an internal rewrite.
 *
 * The invariant is about *identity*, not uniqueness. A username must be unique
 * within an instance — PROJECT_SPEC §5 requires it — so a UNIQUE index on it is
 * correct. What must never happen is a username, handle or domain being used as
 * the identity a row is referenced by: as a primary key, or as the target of a
 * foreign key. That is what makes a rename or an instance move impossible.
 */
const ADDRESS_DERIVED_COLUMNS = new Set(["username", "handle", "domain", "email", "acct", "uri"]);

type TableNameRow = { name: string };
type TableInfoRow = { name: string; pk: number };
type ForeignKeyRow = { table: string; from: string; to: string | null };

describe("ADR 0002 domain invariants", () => {
  it("never uses an address as a primary key", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        const tables = listTables(database);
        expect(tables.length).toBeGreaterThan(0);

        for (const table of tables) {
          const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];

          for (const column of columns) {
            if (column.pk > 0) {
              expect({ column: column.name, table }).toEqual({
                column: expect.not.stringMatching(
                  new RegExp(`^(${[...ADDRESS_DERIVED_COLUMNS].join("|")})$`, "i"),
                ),
                table,
              });
            }
          }
        }
      } finally {
        database.close();
      }
    });
  });

  it("never points a foreign key at an address", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        for (const table of listTables(database)) {
          const keys = database
            .prepare(`PRAGMA foreign_key_list(${table})`)
            .all() as ForeignKeyRow[];

          for (const key of keys) {
            const target = key.to?.toLowerCase();

            // A null target means the referenced table's primary key, already
            // covered by the test above.
            expect({ from: table, target: target ?? null }).toEqual({
              from: table,
              target:
                target === undefined || target === null
                  ? null
                  : expect.not.stringMatching(
                      new RegExp(`^(${[...ADDRESS_DERIVED_COLUMNS].join("|")})$`, "i"),
                    ),
            });
          }
        }
      } finally {
        database.close();
      }
    });
  });

  it("stores timestamps as UTC ISO-8601 strings", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        const applied = database
          .prepare("SELECT applied_at FROM schema_migrations LIMIT 1")
          .get() as { applied_at: string };

        expect(applied.applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
      } finally {
        database.close();
      }
    });
  });
});

function listTables(database: ReturnType<typeof openDatabase>): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as TableNameRow[]
  ).map((row) => row.name);
}
