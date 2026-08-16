import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { BackupConfig } from "@estia/config";

import { createBackup, type ArchiveFamily } from "./service.js";

/**
 * Scheduled backups (ADR 0013), run by the instance itself so that an
 * administrator does not have to learn their NAS's task scheduler. It is the
 * same shape as the orphan sweep: an interval owned by the running process,
 * not a timer inside the app.
 */

export interface BackupLogger {
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

/**
 * One pattern per family, and they must not overlap: a periodic archive is
 * `estia-` followed by the year, an upgrade one carries its own word. Rotating
 * them together would let the ordinary schedule delete the archive an upgrade
 * depends on (ADR 0014, punto 6).
 */
const ARCHIVE: Record<ArchiveFamily, RegExp> = {
  scheduled: /^estia-\d{4}-.*\.tar\.age$/,
  upgrade: /^estia-aggiornamento-.*\.tar\.age$/,
};

/**
 * Removes the oldest archives of one family beyond `keep`.
 *
 * Only ever touches files whose names this instance produces: a backup
 * directory is often a shared folder, and nothing else in it is ours to delete.
 */
export async function pruneArchives(
  directory: string,
  keep: number,
  family: ArchiveFamily = "scheduled",
): Promise<string[]> {
  const names = (await readdir(directory)).filter((name) => ARCHIVE[family].test(name)).sort();
  const doomed = names.slice(0, Math.max(0, names.length - keep));

  for (const name of doomed) {
    await rm(path.join(directory, name), { force: true });
  }

  return doomed;
}

export interface BackupRunResult {
  path: string;
  byteSize: number;
  removed: string[];
}

export async function runScheduledBackup(
  dataDir: string,
  config: Extract<BackupConfig, { scheduled: true }>,
): Promise<BackupRunResult> {
  const result = await createBackup({
    dataDir,
    destination: config.directory,
    recipient: { kind: "publicKey", value: config.publicKey },
  });

  return {
    byteSize: result.byteSize,
    path: result.path,
    removed: await pruneArchives(config.directory, config.keep),
  };
}

/**
 * Starts the schedule and returns how to stop it.
 *
 * The first backup runs shortly after boot rather than a full interval later:
 * an instance that has just been updated or restored is exactly when one wants
 * a fresh archive, and it also surfaces a misconfiguration in seconds instead
 * of the following night.
 */
export function startBackupSchedule(options: {
  dataDir: string;
  config: BackupConfig;
  logger: BackupLogger;
  firstRunDelayMs?: number;
}): () => void {
  const { config, dataDir, logger } = options;

  if (!config.scheduled) {
    // Said out loud, because an administrator who believes backups are running
    // when they are not is worse off than one who knows they are not.
    logger.warn(
      { event: "backup_not_configured" },
      "Nessun backup automatico configurato: imposta ESTIA_BACKUP_DIR e ESTIA_BACKUP_PUBLIC_KEY",
    );

    return () => undefined;
  }

  const run = (): void => {
    void runScheduledBackup(dataDir, config)
      .then((result) => {
        logger.info(
          {
            byteSize: result.byteSize,
            event: "backup_completed",
            path: result.path,
            removed: result.removed.length,
          },
          "Backup cifrato completato",
        );
      })
      .catch((error: unknown) => {
        // Loud, and repeatedly: a backup that stops working is the kind of
        // failure that stays invisible until the day it is needed.
        logger.error({ err: error, event: "backup_failed" }, "Backup automatico fallito");
      });
  };

  const first = setTimeout(run, options.firstRunDelayMs ?? 60_000);
  const repeat = setInterval(run, config.intervalHours * 60 * 60 * 1000);

  first.unref();
  repeat.unref();

  return () => {
    clearTimeout(first);
    clearInterval(repeat);
  };
}

/**
 * The schedule as something that can be changed while the instance runs.
 *
 * Backup settings are editable from the panel (ADR 0016), so the timers have to
 * be re-armed without a restart. Timers only exist between `start()` and
 * `stop()`: a test that builds an app must not end up with a backup running
 * behind it.
 */
export class BackupSchedule {
  #config: BackupConfig;
  #stop: (() => void) | undefined;

  public constructor(
    private readonly options: {
      dataDir: string;
      logger: BackupLogger;
      firstRunDelayMs?: number;
    },
    config: BackupConfig,
  ) {
    this.#config = config;
  }

  public get config(): BackupConfig {
    return this.#config;
  }

  public configure(config: BackupConfig): void {
    this.#config = config;

    if (this.#stop !== undefined) {
      this.stop();
      this.start();
    }
  }

  public start(): void {
    this.#stop ??= startBackupSchedule({ config: this.#config, ...this.options });
  }

  public stop(): void {
    this.#stop?.();
    this.#stop = undefined;
  }

  /**
   * One backup, now, because somebody asked for it.
   *
   * Unlike the scheduled path this one throws: a person is waiting for the
   * answer, and «riuscito» when it was not would be the worst of both.
   */
  public async runNow(): Promise<BackupRunResult> {
    if (!this.#config.scheduled) {
      throw new Error("Nessuna chiave di backup configurata.");
    }

    return runScheduledBackup(this.options.dataDir, this.#config);
  }
}

/** Reports the newest archive, for the diagnostics an administrator can see. */
export async function lastArchive(
  directory: string,
  family: ArchiveFamily = "scheduled",
): Promise<{ name: string; byteSize: number; modifiedAt: Date } | undefined> {
  try {
    const names = (await readdir(directory)).filter((name) => ARCHIVE[family].test(name)).sort();
    const newest = names.at(-1);

    if (newest === undefined) {
      return undefined;
    }

    const stats = await stat(path.join(directory, newest));

    return { byteSize: stats.size, modifiedAt: stats.mtime, name: newest };
  } catch {
    return undefined;
  }
}
