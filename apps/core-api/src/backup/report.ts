import type { BackupConfig } from "@estia/config";
import type { BackupArchiveView, BackupReport } from "@estia/contracts";

import { backupMemoryWarning } from "./memory.js";
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

function ago(from: Date, to: Date): string {
  const hours = Math.floor((to.getTime() - from.getTime()) / (60 * 60 * 1000));

  if (hours < 1) {
    return "meno di un'ora fa";
  }

  if (hours < 48) {
    return `${String(hours)} ore fa`;
  }

  return `${String(Math.floor(hours / 24))} giorni fa`;
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
  const memoryWarning = backupMemoryWarning(
    options.storedBytes === undefined ? 0 : options.storedBytes(),
    options.memoryLimitBytes,
  );
  const memory = memoryWarning === undefined ? {} : { memoryWarning };

  if (!options.config.scheduled) {
    return {
      ...memory,
      detail:
        "Nessun backup automatico configurato: questa istanza non ne sta facendo. Imposta ESTIA_BACKUP_DIR e ESTIA_BACKUP_PUBLIC_KEY.",
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
        detail:
          "Backup configurati. Il primo archivio arriva un minuto dopo l'avvio: se fra poco non c'è, qualcosa non va.",
        health: "waiting",
      };
    }

    return {
      ...common,
      detail: `Backup configurati, ma in ${directory} non c'è nessun archivio. Non stanno funzionando: controlla i permessi della cartella e i log per «backup_failed».`,
      health: "missing",
    };
  }

  const age = now.getTime() - new Date(last.modifiedAt).getTime();

  if (age > intervalHours * STALE_FACTOR * 60 * 60 * 1000) {
    return {
      ...common,
      detail: `L'ultimo backup è di ${ago(new Date(last.modifiedAt), now)}, ma l'intervallo configurato è di ${String(intervalHours)} ore. Ne sono stati saltati: controlla i log per «backup_failed».`,
      health: "stale",
    };
  }

  return {
    ...common,
    detail: `Ultimo backup ${ago(new Date(last.modifiedAt), now)}, ogni ${String(intervalHours)} ore, ne tiene ${String(keep)}. Ricorda che l'istanza non è in grado di rileggerli: serve la chiave privata che hai messo da parte.`,
    health: "healthy",
  };
}
