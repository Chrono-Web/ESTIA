import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Writable } from "node:stream";

import { loadConfig, type AppConfig, type BackupConfig } from "@estia/config";
import type { AdminDiagnostics } from "@estia/contracts";
import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createBackupKeyPair } from "../backup/crypto.js";
import { restoreBackup } from "../backup/service.js";
import { openDatabase, readSchemaState } from "./database.js";
import { migrations } from "./migrations.js";
import { prepareDatabase, readLastUpgrade, type UpgradeLogger } from "./upgrade.js";

/**
 * The instance backs itself up before moving its schema forward (ADR 0014).
 *
 * The tests build a database of an older version for real — by migrating it
 * with a truncated list — rather than mocking the schema. What is under test is
 * an ordering between two operations that both open the same database, and
 * nothing short of the real files would exercise it.
 */

const OLD = migrations.slice(0, 6);
const CURRENT_VERSION = migrations.at(-1)?.version ?? 0;

function recorder(): { events: string[]; logger: UpgradeLogger } {
  const events: string[] = [];
  const record = (details: Record<string, unknown>): void => {
    events.push(String(details.event));
  };

  return { events, logger: { error: record, info: record, warn: record } };
}

/** A database at version 6, with something in it worth not losing. */
function seedOldInstance(dataDir: string): void {
  const database = openDatabase(dataDir, OLD);

  database
    .prepare(
      `INSERT INTO instance (id, name, description, public_key, created_at, singleton)
       VALUES (?, ?, '', ?, ?, 1)`,
    )
    .run("id-1", "Via Roma", "chiave-pubblica", new Date().toISOString());

  database.close();
}

async function backupTo(directory: string): Promise<{
  config: Extract<BackupConfig, { scheduled: true }>;
  privateKey: string;
}> {
  const keys = await createBackupKeyPair();

  return {
    config: {
      directory,
      intervalHours: 24,
      keep: 7,
      publicKey: keys.publicKey,
      scheduled: true,
    },
    privateKey: keys.privateKey,
  };
}

function archives(directory: string, prefix: string): string[] {
  return readdirSync(directory).filter((name) => name.startsWith(prefix));
}

describe("knowing what is missing without applying it", () => {
  it("calls a database that has never been migrated fresh, and creates nothing", async () => {
    await withTempDataDir(async (dataDir) => {
      const database = new DatabaseSync(path.join(dataDir, "estia.db"));

      try {
        const state = readSchemaState(database);

        expect(state).toMatchObject({ currentVersion: 0, fresh: true });
        expect(state.pending).toHaveLength(migrations.length);

        // Reading must not write: the absence of the table is the only evidence
        // that this instance is new, and a probe that created it would burn it.
        expect(
          database.prepare("SELECT name FROM sqlite_master WHERE name = 'schema_migrations'").get(),
        ).toBeUndefined();
      } finally {
        database.close();
      }
    });
  });

  it("reports exactly what an older instance is missing", async () => {
    await withTempDataDir(async (dataDir) => {
      seedOldInstance(dataDir);

      const database = new DatabaseSync(path.join(dataDir, "estia.db"));

      try {
        const state = readSchemaState(database);

        expect(state).toMatchObject({ currentVersion: 6, fresh: false });
        expect(state.pending.map((migration) => migration.version)).toEqual([7]);
      } finally {
        database.close();
      }
    });
  });
});

describe("the backup that precedes a migration", () => {
  /**
   * The assertion that decides whether the ordering is right: the archive must
   * hold the schema as it was **before** the migrations. If it were taken a
   * moment later it would be a copy of the new schema, which is exactly the
   * useless thing ADR 0014 exists to prevent.
   */
  it("writes an archive that holds the schema as it was before", async () => {
    await withTempDataDir(async (dataDir) => {
      await withTempDataDir(async (backupDir) => {
        seedOldInstance(dataDir);

        const { config, privateKey } = await backupTo(backupDir);
        const { events, logger } = recorder();
        const prepared = await prepareDatabase({ backup: config, dataDir, logger });

        prepared.database.close();

        expect(prepared.upgrade).toMatchObject({
          backupStatus: "created",
          fromVersion: 6,
          migrationCount: 1,
          toVersion: CURRENT_VERSION,
        });
        expect(events).toContain("schema_migrated");

        const written = archives(backupDir, "estia-aggiornamento-");

        expect(written).toHaveLength(1);
        expect(prepared.upgrade?.backupName).toBe(written[0]);

        await withTempDataDir(async (restoreRoot) => {
          const restored = path.join(restoreRoot, "prima");

          await restoreBackup({
            archive: path.join(backupDir, written[0] ?? ""),
            destination: restored,
            key: { kind: "privateKey", value: privateKey },
          });

          const snapshot = new DatabaseSync(path.join(restored, "estia.db"));

          try {
            const highest = snapshot
              .prepare("SELECT MAX(version) AS version FROM schema_migrations")
              .get() as { version: number };

            expect(highest.version).toBe(6);

            // The table this very upgrade creates must not be in the snapshot.
            expect(
              snapshot
                .prepare("SELECT name FROM sqlite_master WHERE name = 'schema_upgrades'")
                .get(),
            ).toBeUndefined();

            // And what was there before is there: a backup of an empty schema
            // would satisfy the check above and be worth nothing.
            expect(
              (snapshot.prepare("SELECT name FROM instance").get() as { name: string }).name,
            ).toBe("Via Roma");
          } finally {
            snapshot.close();
          }
        });
      });
    });
  });

  it("takes no backup on a first boot: there is nothing to protect yet", async () => {
    await withTempDataDir(async (dataDir) => {
      await withTempDataDir(async (backupDir) => {
        const { config } = await backupTo(backupDir);
        const { events, logger } = recorder();
        const prepared = await prepareDatabase({ backup: config, dataDir, logger });

        try {
          expect(prepared.upgrade).toBeUndefined();
          expect(readdirSync(backupDir)).toEqual([]);
          expect(events).toEqual([]);
          expect(readSchemaState(prepared.database).pending).toHaveLength(0);
        } finally {
          prepared.database.close();
        }
      });
    });
  });

  it("does nothing at all when the schema is already up to date", async () => {
    await withTempDataDir(async (dataDir) => {
      await withTempDataDir(async (backupDir) => {
        seedOldInstance(dataDir);

        const { config } = await backupTo(backupDir);
        const first = await prepareDatabase({ backup: config, dataDir, logger: recorder().logger });
        first.database.close();

        const { events, logger } = recorder();
        const second = await prepareDatabase({ backup: config, dataDir, logger });

        try {
          expect(archives(backupDir, "estia-aggiornamento-")).toHaveLength(1);
          expect(events).toEqual([]);
          // Still reported, because it still describes something true.
          expect(second.upgrade).toMatchObject({ backupStatus: "created", fromVersion: 6 });
        } finally {
          second.database.close();
        }
      });
    });
  });
});

describe("when the backup cannot be written", () => {
  /** Decided, and not by default: the instance starts anyway and says so. */
  it("migrates without a backup rather than leaving a neighbourhood without its board", async () => {
    await withTempDataDir(async (dataDir) => {
      seedOldInstance(dataDir);

      const { events, logger } = recorder();
      const prepared = await prepareDatabase({
        backup: { scheduled: false },
        dataDir,
        logger,
      });

      try {
        expect(prepared.upgrade).toMatchObject({ backupStatus: "not_configured" });
        expect(prepared.upgrade?.detail).toMatch(/non ha un punto di ritorno/);

        // Warned before the change and recorded after it, in that order: the
        // second line only exists if the boot gets far enough to write it.
        expect(events).toEqual([
          "schema_migration_without_backup",
          "schema_migrated_without_backup",
        ]);

        // Applied all the same: that is the decision, not a side effect.
        expect(readSchemaState(prepared.database).pending).toHaveLength(0);
      } finally {
        prepared.database.close();
      }
    });
  });

  /**
   * The louder case. An administrator without backups knows it; one whose
   * backups are broken believes they are protected, which is the same asymmetry
   * ADR 0007 draws for a declared encryption that is not there.
   */
  it("shouts when a configured backup fails, and still starts", async () => {
    await withTempDataDir(async (dataDir) => {
      await withTempDataDir(async (backupDir) => {
        seedOldInstance(dataDir);

        const { events, logger } = recorder();
        const prepared = await prepareDatabase({
          backup: {
            directory: backupDir,
            intervalHours: 24,
            keep: 7,
            // Shaped like an age key, and not one: a typo in the configuration.
            publicKey: "age1chiavesbagliata",
            scheduled: true,
          },
          dataDir,
          logger,
        });

        try {
          expect(prepared.upgrade).toMatchObject({ backupStatus: "failed" });
          expect(prepared.upgrade?.detail).toMatch(/non stanno funzionando/);
          expect(events).toContain("schema_backup_failed");
          expect(readdirSync(backupDir)).toEqual([]);
          expect(readSchemaState(prepared.database).pending).toHaveLength(0);
        } finally {
          prepared.database.close();
        }
      });
    });
  });

  /**
   * Migrations only go forward, so an upgrade that happened without a point of
   * return still has none tomorrow. An advisory that expired at the next
   * restart would report a problem as solved when it is not.
   */
  it("keeps saying it after a restart", async () => {
    await withTempDataDir(async (dataDir) => {
      seedOldInstance(dataDir);

      const first = await prepareDatabase({
        backup: { scheduled: false },
        dataDir,
        logger: recorder().logger,
      });
      first.database.close();

      const second = await prepareDatabase({
        backup: { scheduled: false },
        dataDir,
        logger: recorder().logger,
      });

      try {
        expect(second.upgrade).toMatchObject({ backupStatus: "not_configured", fromVersion: 6 });
        expect(readLastUpgrade(second.database)).toMatchObject({
          backupStatus: "not_configured",
        });
      } finally {
        second.database.close();
      }
    });
  });
});

describe("what an administrator actually sees", () => {
  const SETUP_TOKEN = "token-di-prova";
  const ADMIN = { password: "una-password-lunga", username: "palu" };

  function configFor(dataDir: string): AppConfig {
    return loadConfig({
      ESTIA_DATA_DIR: dataDir,
      ESTIA_HOST: "127.0.0.1",
      ESTIA_LOG_LEVEL: "warn",
    });
  }

  /** «Lo dichiara» has to reach a person, not only a log file (ADR 0014, punto 5). */
  it("reports an upgrade without a point of return in the diagnostics", async () => {
    await withTempDataDir(async (dataDir) => {
      const captured: string[] = [];

      // An instance from before this change, started by the new code.
      openDatabase(dataDir, OLD).close();

      const app = await buildApp(configFor(dataDir), {
        logDestination: new Writable({
          write(chunk, _encoding, done) {
            captured.push(String(chunk));
            done();
          },
        }),
        setupToken: SETUP_TOKEN,
      });

      try {
        await app.inject({
          method: "POST",
          payload: {
            adminPassword: ADMIN.password,
            adminUsername: ADMIN.username,
            name: "Via Roma",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });

        const token = (
          await app.inject({
            method: "POST",
            payload: { password: ADMIN.password, username: ADMIN.username },
            url: "/api/v1/auth/login",
          })
        ).json().token;

        const diagnostics = (
          await app.inject({
            headers: { authorization: `Bearer ${token}` },
            method: "GET",
            url: "/api/v1/admin/diagnostics",
          })
        ).json() as AdminDiagnostics;

        expect(diagnostics.lastUpgrade).toMatchObject({
          backupStatus: "not_configured",
          fromVersion: 6,
          toVersion: CURRENT_VERSION,
        });
        expect(captured.join("")).toContain("schema_migrated_without_backup");
      } finally {
        await app.close();
      }
    });
  });

  it("says nothing about upgrades on an instance that has only ever been created", async () => {
    await withTempDataDir(async (dataDir) => {
      const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

      try {
        await app.inject({
          method: "POST",
          payload: {
            adminPassword: ADMIN.password,
            adminUsername: ADMIN.username,
            name: "Via Roma",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });

        const token = (
          await app.inject({
            method: "POST",
            payload: { password: ADMIN.password, username: ADMIN.username },
            url: "/api/v1/auth/login",
          })
        ).json().token;

        const diagnostics = (
          await app.inject({
            headers: { authorization: `Bearer ${token}` },
            method: "GET",
            url: "/api/v1/admin/diagnostics",
          })
        ).json() as AdminDiagnostics;

        expect(diagnostics.lastUpgrade).toBeUndefined();
        expect(existsSync(path.join(dataDir, "estia.db"))).toBe(true);
      } finally {
        await app.close();
      }
    });
  });
});
