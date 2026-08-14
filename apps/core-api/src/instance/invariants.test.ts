import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";

/**
 * Guards the domain invariants of ADR 0002. These are the properties that keep
 * a future ActivityPub mapping possible without an internal rewrite, and a
 * single careless `UNIQUE(username)` used as a foreign key is enough to break
 * them silently. Hence a test rather than a review note.
 */
const ADDRESS_DERIVED_COLUMNS = new Set(["username", "handle", "domain", "email", "acct", "uri"]);

type TableNameRow = { name: string };
type TableInfoRow = { name: string; pk: number };
type IndexListRow = { name: string; unique: number };
type IndexInfoRow = { name: string | null };

describe("ADR 0002 domain invariants", () => {
  it("never derives a primary key or a unique constraint from an address", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        const tables = database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as TableNameRow[];

        expect(tables.length).toBeGreaterThan(0);

        for (const { name: table } of tables) {
          const columns = database.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];

          for (const column of columns) {
            if (column.pk > 0) {
              expect(ADDRESS_DERIVED_COLUMNS.has(column.name.toLowerCase())).toBe(false);
            }
          }

          const indexes = database.prepare(`PRAGMA index_list(${table})`).all() as IndexListRow[];

          for (const index of indexes) {
            if (index.unique !== 1) {
              continue;
            }

            const members = database
              .prepare(`PRAGMA index_info(${index.name})`)
              .all() as IndexInfoRow[];

            for (const member of members) {
              const columnName = member.name?.toLowerCase();
              expect(columnName === undefined || !ADDRESS_DERIVED_COLUMNS.has(columnName)).toBe(
                true,
              );
            }
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
