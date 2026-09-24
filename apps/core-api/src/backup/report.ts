import type { BackupConfig } from "@estia/config";
import type { BackupArchiveView, BackupReport } from "@estia/contracts";

import { comeCampo, type Diagnosis, diagnosi } from "../diagnostics.js";
import { backupMemoryDiagnosis } from "./memory.js";
import { lastArchive } from "./schedule.js";

/**
 * What the administrator can see about their own backups.
 *
 * `backup_not_configured` has been shouted into the logs since ADR 0013, which
 * reaches whoever goes looking. This is the other half: the failure this is
 * really about is not the absent backup but the **silent** one — configured,
 * believed in, and not happening — which stays invisible until the day it is
 * needed. So the report does not stop at «configured yes or no»: it looks at
 * whether an archive actually landed, and when.
 */

/**
 * How long after boot a missing archive is still normal. The first scheduled
 * backup runs a minute after startup; ten minutes is generous enough that
 * anything past it is a real problem rather than a race with the timer.
 */
const GRACE_MS = 10 * 60 * 1000;

/** Two intervals: one missed run is a hiccup, two is a pattern. */
const STALE_FACTOR = 2;

function view(
  archive: { name: string; byteSize: number; modifiedAt: Date } | undefined,
): BackupArchiveView | undefined {
  return archive === undefined
    ? undefined
    : {
        byteSize: archive.byteSize,
        modifiedAt: archive.modifiedAt.toISOString(),
        name: archive.name,
      };
}

/** How long ago, in the unit the sentence uses: under an hour, hours, or days. */
function ago(from: Date, to: Date): { unit: "recent" | "hours" | "days"; count: number } {
  const hours = Math.floor((to.getTime() - from.getTime()) / (60 * 60 * 1000));

  if (hours < 1) {
    return { count: 0, unit: "recent" };
  }

  if (hours < 48) {
    return { count: hours, unit: "hours" };
  }

  return { count: Math.floor(hours / 24), unit: "days" };
}

function stale(last: Date, now: Date, interval: number): Diagnosis {
  const { count, unit } = ago(last, now);

  switch (unit) {
    case "recent":
      return diagnosi("diagnostics.backup.stale_recent", { interval });
    case "hours":
      return diagnosi("diagnostics.backup.stale_hours", { count, interval });
    case "days":
      return diagnosi("diagnostics.backup.stale_days", { count, interval });
  }
}

function healthy(last: Date, now: Date, interval: number, keep: number): Diagnosis {
  const { count, unit } = ago(last, now);

  switch (unit) {
    case "recent":
      return diagnosi("diagnostics.backup.healthy_recent", { interval, keep });
    case "hours":
      return diagnosi("diagnostics.backup.healthy_hours", { count, interval, keep });
    case "days":
      return diagnosi("diagnostics.backup.healthy_days", { count, interval, keep });
  }
}

export interface BackupReportOptions {
  config: BackupConfig;
  /** When the process started, to tell a missing archive from a young instance. */
  startedAt: Date;
  now?: () => Date;
  /** Bytes an archive would have to hold, read per request because it grows. */
  storedBytes?: () => number;
  /** The container's memory limit, when there is one to read. */
  memoryLimitBytes?: number | undefined;
}

export async function buildBackupReport(options: BackupReportOptions): Promise<BackupReport> {
  const now = (options.now ?? ((): Date => new Date()))();

  // Said whatever the schedule is doing: it is a prediction about the next
  // backup, not a report on the last one.
  const memoryWarning = backupMemoryDiagnosis(
    options.storedBytes === undefined ? 0 : options.storedBytes(),
    options.memoryLimitBytes,
  );
  const memory = memoryWarning === undefined ? {} : comeCampo("memoryWarning", memoryWarning);

  if (!options.config.scheduled) {
    return {
      ...memory,
      ...diagnosi("diagnostics.backup.not_configured"),
      health: "not_configured",
    };
  }

  const { directory, intervalHours, keep } = options.config;
  const last = view(await lastArchive(directory));
  const lastUpgrade = view(await lastArchive(directory, "upgrade"));
  const common = {
    ...memory,
    intervalHours,
    keep,
    ...(last === undefined ? {} : { last }),
    ...(lastUpgrade === undefined ? {} : { lastUpgradeArchive: lastUpgrade }),
  };

  if (last === undefined) {
    // Young instance: the timer simply has not fired yet.
    if (now.getTime() - options.startedAt.getTime() < GRACE_MS) {
      return {
        ...common,
        ...diagnosi("diagnostics.backup.waiting"),
        health: "waiting",
      };
    }

    return {
      ...common,
      ...diagnosi("diagnostics.backup.missing"),
      health: "missing",
    };
  }

  const age = now.getTime() - new Date(last.modifiedAt).getTime();

  if (age > intervalHours * STALE_FACTOR * 60 * 60 * 1000) {
    return {
      ...common,
      ...stale(new Date(last.modifiedAt), now, intervalHours),
      health: "stale",
    };
  }

  return {
    ...common,
    ...healthy(new Date(last.modifiedAt), now, intervalHours, keep),
    health: "healthy",
  };
}
