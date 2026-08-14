import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase, runMigrations } from "./database.js";

describe("instance database", () => {
  it("creates the schema from scratch and applies each migration once", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        const applied = database
          .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
          .all() as { name: string; version: number }[];

        expect(applied).toEqual([
          { name: "instance", version: 1 },
          { name: "accounts-and-sessions", version: 2 },
          { name: "recovery-codes", version: 3 },
          { name: "admission", version: 4 },
        ]);

        // Re-running must be a no-op rather than an error.
        expect(runMigrations(database)).toEqual([]);
      } finally {
        database.close();
      }
    });
  });

  it("enforces foreign keys on the connection", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        const pragma = database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
        expect(pragma.foreign_keys).toBe(1);
      } finally {
        database.close();
      }
    });
  });

  it("allows at most one instance row", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        const insert = database.prepare(
          `INSERT INTO instance (id, name, description, public_key, created_at, singleton)
           VALUES (?, ?, '', ?, ?, 1)`,
        );

        insert.run("id-1", "Prima", "chiave", new Date().toISOString());

        expect(() => {
          insert.run("id-2", "Seconda", "chiave", new Date().toISOString());
        }).toThrow();
      } finally {
        database.close();
      }
    });
  });

  it("keeps the data files readable only by the owner", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = openDatabase(dataDir);

      try {
        // Writes so that the WAL file exists and inherits the permissions.
        database
          .prepare(
            `INSERT INTO instance (id, name, description, public_key, created_at, singleton)
             VALUES (?, ?, '', ?, ?, 1)`,
          )
          .run("id-1", "Quartiere", "chiave", new Date().toISOString());

        expect(statSync(dataDir).mode & 0o777).toBe(0o700);

        for (const file of ["estia.db", "estia.db-wal", "estia.db-shm"]) {
          const filePath = path.join(dataDir, file);

          if (existsSync(filePath)) {
            expect({ file, mode: statSync(filePath).mode & 0o777 }).toEqual({ file, mode: 0o600 });
          }
        }
      } finally {
        database.close();
      }
    });
  });

  it("keeps the schema across reopens", async () => {
    await withTempDataDir(async (dataDir) => {
      const first = openDatabase(dataDir);
      first
        .prepare(
          `INSERT INTO instance (id, name, description, public_key, created_at, singleton)
           VALUES (?, ?, '', ?, ?, 1)`,
        )
        .run("id-1", "Quartiere", "chiave", new Date().toISOString());
      first.close();

      const second = openDatabase(dataDir);

      try {
        const row = second.prepare("SELECT name FROM instance").get() as { name: string };
        expect(row.name).toBe("Quartiere");
      } finally {
        second.close();
      }
    });
  });
});
