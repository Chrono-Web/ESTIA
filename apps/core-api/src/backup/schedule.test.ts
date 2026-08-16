import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadConfig, loadDataDir, ConfigurationError, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { createBackupKeyPair } from "./crypto.js";
import { lastArchive, pruneArchives, runScheduledBackup, startBackupSchedule } from "./schedule.js";

const SETUP_TOKEN = "token-di-prova";

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

/** A configured instance, closed again: enough to have something to back up. */
async function withInstance(use: (dataDir: string) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: "una-password-lunga",
          adminUsername: "palu",
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });
    } finally {
      await app.close();
    }

    await use(dataDir);
  });
}

describe("configuring scheduled backups", () => {
  it("is off by default", () => {
    expect(loadConfig({}).backup).toEqual({ scheduled: false });
  });

  it("refuses a half configuration instead of quietly doing nothing", () => {
    expect(() => loadConfig({ ESTIA_BACKUP_DIR: "/backup" })).toThrow(ConfigurationError);
    expect(() => loadConfig({ ESTIA_BACKUP_PUBLIC_KEY: "age1qualcosa" })).toThrow(
      ConfigurationError,
    );
  });

  /** The dangerous mistake: the key that must never touch the instance. */
  it("refuses a private key where the public one belongs, and says why", () => {
    expect(() =>
      loadConfig({
        ESTIA_BACKUP_DIR: "/backup",
        ESTIA_BACKUP_PUBLIC_KEY: "AGE-SECRET-KEY-1QQQQQQ",
      }),
    ).toThrow(/chiave PRIVATA/);
  });

  it("refuses something that is not an age key at all", () => {
    expect(() =>
      loadConfig({ ESTIA_BACKUP_DIR: "/backup", ESTIA_BACKUP_PUBLIC_KEY: "ssh-ed25519 AAAA" }),
    ).toThrow(/age1/);
  });

  /**
   * The rule above protects an instance from booting half-configured. It must
   * not reach the command line: the instance with no scheduled backups is
   * precisely the one that most needs to be able to take a manual archive, and
   * for a while it was the one that could not.
   */
  it("does not let that rule stop a one-off backup from the command line", () => {
    expect(loadDataDir({ ESTIA_BACKUP_PUBLIC_KEY: "age1esempio", ESTIA_DATA_DIR: "/data" })).toBe(
      "/data",
    );
    expect(loadDataDir({})).toBe("./.data");
  });

  it("accepts a whole configuration, with sane defaults", () => {
    expect(
      loadConfig({
        ESTIA_BACKUP_DIR: "/backup",
        ESTIA_BACKUP_PUBLIC_KEY: "age1esempio",
      }).backup,
    ).toEqual({
      directory: "/backup",
      intervalHours: 24,
      keep: 7,
      publicKey: "age1esempio",
      scheduled: true,
    });
  });
});

describe("keeping the backup directory from filling up", () => {
  it("keeps the newest and removes the rest", async () => {
    await withTempDataDir(async (directory) => {
      for (const day of ["10", "11", "12", "13", "14"]) {
        writeFileSync(path.join(directory, `estia-2026-08-${day}T00-00-00Z.tar.age`), "x");
      }

      const removed = await pruneArchives(directory, 2);

      expect(removed).toHaveLength(3);
      expect(readdirSync(directory).sort()).toEqual([
        "estia-2026-08-13T00-00-00Z.tar.age",
        "estia-2026-08-14T00-00-00Z.tar.age",
      ]);
    });
  });

  /** A backup directory is often a shared folder; the rest of it is not ours. */
  it("never touches files it did not write", async () => {
    await withTempDataDir(async (directory) => {
      writeFileSync(path.join(directory, "estia-2026-08-10T00-00-00Z.tar.age"), "x");
      writeFileSync(path.join(directory, "foto-di-famiglia.jpg"), "x");
      writeFileSync(path.join(directory, "appunti.txt"), "x");

      await pruneArchives(directory, 0);

      expect(readdirSync(directory).sort()).toEqual(["appunti.txt", "foto-di-famiglia.jpg"]);
    });
  });

  /**
   * The reason the two families are told apart at all (ADR 0014, punto 6): with
   * `ESTIA_BACKUP_KEEP=1` a shared rotation would let the following night
   * delete the only point of return of an upgrade.
   */
  it("does not let the nightly rotation delete an upgrade archive", async () => {
    await withTempDataDir(async (directory) => {
      writeFileSync(path.join(directory, "estia-aggiornamento-2026-08-16T09-00-00Z.tar.age"), "x");
      writeFileSync(path.join(directory, "estia-2026-08-16T10-00-00Z.tar.age"), "x");

      expect(await pruneArchives(directory, 0)).toEqual(["estia-2026-08-16T10-00-00Z.tar.age"]);
      expect(readdirSync(directory)).toEqual(["estia-aggiornamento-2026-08-16T09-00-00Z.tar.age"]);
    });
  });

  it("rotates upgrade archives among themselves, leaving the nightly ones alone", async () => {
    await withTempDataDir(async (directory) => {
      writeFileSync(path.join(directory, "estia-aggiornamento-2026-01-01T00-00-00Z.tar.age"), "x");
      writeFileSync(path.join(directory, "estia-aggiornamento-2026-08-16T09-00-00Z.tar.age"), "x");
      writeFileSync(path.join(directory, "estia-2026-08-16T10-00-00Z.tar.age"), "x");

      expect(await pruneArchives(directory, 1, "upgrade")).toEqual([
        "estia-aggiornamento-2026-01-01T00-00-00Z.tar.age",
      ]);
      expect(readdirSync(directory).sort()).toEqual([
        "estia-2026-08-16T10-00-00Z.tar.age",
        "estia-aggiornamento-2026-08-16T09-00-00Z.tar.age",
      ]);
    });
  });
});

describe("running a scheduled backup", () => {
  it("writes an archive and reports the newest one", async () => {
    await withInstance(async (dataDir) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const config = {
          directory: out,
          intervalHours: 24,
          keep: 2,
          publicKey: keys.publicKey,
          scheduled: true,
        } as const;

        const first = await runScheduledBackup(dataDir, config);

        expect(existsSync(first.path)).toBe(true);
        expect(first.removed).toHaveLength(0);

        const newest = await lastArchive(out);

        expect(newest?.name).toBe(path.basename(first.path));
        expect(newest?.byteSize).toBe(first.byteSize);
      });
    });
  });

  it("prunes older archives once there are too many", async () => {
    await withInstance(async (dataDir) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const config = {
          directory: out,
          intervalHours: 24,
          keep: 1,
          publicKey: keys.publicKey,
          scheduled: true,
        } as const;

        // An older archive already there, from a previous night.
        writeFileSync(path.join(out, "estia-2026-01-01T00-00-00Z.tar.age"), "vecchio");

        const result = await runScheduledBackup(dataDir, config);

        expect(result.removed).toEqual(["estia-2026-01-01T00-00-00Z.tar.age"]);
        expect(readdirSync(out)).toEqual([path.basename(result.path)]);
      });
    });
  });
});

describe("the schedule itself", () => {
  it("says out loud when no backup is configured", () => {
    const warnings: string[] = [];
    const logger = {
      error: () => undefined,
      info: () => undefined,
      warn: (details: Record<string, unknown>) => warnings.push(String(details.event)),
    };

    const stop = startBackupSchedule({
      config: { scheduled: false },
      dataDir: "/non/serve",
      logger,
    });

    expect(warnings).toEqual(["backup_not_configured"]);
    stop();
  });

  it("runs the first backup shortly after boot, not an interval later", async () => {
    await withInstance(async (dataDir) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const events: string[] = [];
        const record = (details: Record<string, unknown>): void => {
          events.push(String(details.event));
        };

        const stop = startBackupSchedule({
          config: {
            directory: out,
            intervalHours: 24,
            keep: 3,
            publicKey: keys.publicKey,
            scheduled: true,
          },
          dataDir,
          firstRunDelayMs: 5,
          logger: { error: record, info: record, warn: record },
        });

        await new Promise((resolve) => setTimeout(resolve, 900));
        stop();

        expect(events).toContain("backup_completed");
        expect(readdirSync(out).filter((name) => name.endsWith(".tar.age"))).toHaveLength(1);
      });
    });
  });
});
