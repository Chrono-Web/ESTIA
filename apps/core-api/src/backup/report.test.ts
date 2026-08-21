import { utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BackupConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildBackupReport } from "./report.js";

/**
 * The failure this report exists for is not the absent backup — the logs have
 * said `backup_not_configured` since ADR 0013 — but the silent one: configured,
 * believed in, and not happening.
 */

const NOW = new Date("2026-08-16T12:00:00.000Z");

function scheduled(directory: string, intervalHours = 24): BackupConfig {
  return { directory, intervalHours, keep: 7, publicKey: "age1esempio", scheduled: true };
}

/** An archive on disk with a chosen age, which is what the report reads. */
function archive(directory: string, name: string, modifiedAt: Date): void {
  const file = path.join(directory, name);

  writeFileSync(file, "archivio finto");
  utimesSync(file, modifiedAt, modifiedAt);
}

describe("what an administrator can see about their backups", () => {
  it("says plainly when there are none, without dressing it up", async () => {
    const report = await buildBackupReport({
      config: { scheduled: false },
      now: () => NOW,
      startedAt: NOW,
    });

    expect(report.health).toBe("not_configured");
    expect(report.detail).toMatch(/Non ancora attivi/);
  });

  it("does not cry wolf in the first minutes after a boot", async () => {
    await withTempDataDir(async (directory) => {
      const report = await buildBackupReport({
        config: scheduled(directory),
        now: () => NOW,
        // Booted two minutes ago: the first backup runs a minute after start.
        startedAt: new Date(NOW.getTime() - 2 * 60 * 1000),
      });

      expect(report.health).toBe("waiting");
    });
  });

  /** The case worth building this for: configured, and nothing ever landed. */
  it("calls out an instance that has been up for hours with no archive", async () => {
    await withTempDataDir(async (directory) => {
      const report = await buildBackupReport({
        config: scheduled(directory),
        now: () => NOW,
        startedAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
      });

      expect(report.health).toBe("missing");
      expect(report.detail).toMatch(/Non stanno funzionando/);
    });
  });

  it("reports a healthy schedule with the archive it found", async () => {
    await withTempDataDir(async (directory) => {
      archive(
        directory,
        "estia-2026-08-16T09-00-00Z.tar.age",
        new Date("2026-08-16T09:00:00.000Z"),
      );

      const report = await buildBackupReport({
        config: scheduled(directory),
        now: () => NOW,
        startedAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
      });

      expect(report).toMatchObject({ health: "healthy", intervalHours: 24, keep: 7 });
      expect(report.last?.name).toBe("estia-2026-08-16T09-00-00Z.tar.age");
      expect(report.detail).toMatch(/Ultimo .*ore fa/);
      expect(report.detail).toMatch(/Ogni 24 ore/);
    });
  });

  /** Two missed runs is a pattern, and it is invisible without this. */
  it("notices archives that stopped arriving", async () => {
    await withTempDataDir(async (directory) => {
      archive(
        directory,
        "estia-2026-08-10T09-00-00Z.tar.age",
        new Date("2026-08-10T09:00:00.000Z"),
      );

      const report = await buildBackupReport({
        config: scheduled(directory),
        now: () => NOW,
        startedAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
      });

      expect(report.health).toBe("stale");
      expect(report.detail).toMatch(/6 giorni fa/);
    });
  });

  it("reports the archive of an upgrade separately from the periodic ones", async () => {
    await withTempDataDir(async (directory) => {
      archive(
        directory,
        "estia-2026-08-16T09-00-00Z.tar.age",
        new Date("2026-08-16T09:00:00.000Z"),
      );
      archive(
        directory,
        "estia-aggiornamento-2026-08-15T20-00-00Z.tar.age",
        new Date("2026-08-15T20:00:00.000Z"),
      );

      const report = await buildBackupReport({
        config: scheduled(directory),
        now: () => NOW,
        startedAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
      });

      expect(report.last?.name).toBe("estia-2026-08-16T09-00-00Z.tar.age");
      expect(report.lastUpgradeArchive?.name).toBe(
        "estia-aggiornamento-2026-08-15T20-00-00Z.tar.age",
      );
    });
  });

  /** A backup directory that is gone is not a healthy backup directory. */
  it("does not mistake an unreadable directory for an empty one being patient", async () => {
    const report = await buildBackupReport({
      config: scheduled("/percorso/che/non/esiste"),
      now: () => NOW,
      startedAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
    });

    expect(report.health).toBe("missing");
  });
});
