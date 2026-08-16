import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { BackupConfig } from "@estia/config";

/**
 * Backup settings an administrator can change from the panel (ADR 0016).
 *
 * Two rules hold this together, and both exist to avoid two truths that can
 * disagree:
 *
 * - **the environment wins.** Where `ESTIA_BACKUP_PUBLIC_KEY` is set, these
 *   settings are read-only and the panel says where the value comes from,
 *   instead of offering an edit the next restart would undo;
 * - **the directory is never one of them.** A path arriving from the network is
 *   a write the instance would perform wherever it was told to. It comes from
 *   the environment or it is `backup/` inside the data directory, and nowhere
 *   else.
 */

/** Where archives go when nobody said otherwise: beside the data, on the same disk. */
export const DEFAULT_BACKUP_SUBDIR = "backup";

export interface StoredBackupSettings {
  publicKey?: string;
  intervalHours: number;
  keep: number;
}

const DEFAULTS = { intervalHours: 24, keep: 7 } as const;

const KEYS = {
  intervalHours: "backup.interval_hours",
  keep: "backup.keep",
  publicKey: "backup.public_key",
} as const;

export interface SettingsRepository {
  read(key: string): string | undefined;
  write(key: string, value: string, updatedAt: string): void;
  clear(key: string): void;
}

export class SqliteSettingsRepository implements SettingsRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public read(key: string): string | undefined {
    const row = this.database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      { value: string } | undefined;

    return row?.value;
  }

  public write(key: string, value: string, updatedAt: string): void {
    this.database
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, updatedAt);
  }

  public clear(key: string): void {
    this.database.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}

function readNumber(
  repository: SettingsRepository,
  key: string,
  fallback: number,
  maximum: number,
): number {
  const raw = repository.read(key);
  const parsed = raw === undefined ? Number.NaN : Number(raw);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function readStoredSettings(repository: SettingsRepository): StoredBackupSettings {
  const publicKey = repository.read(KEYS.publicKey);

  return {
    intervalHours: readNumber(repository, KEYS.intervalHours, DEFAULTS.intervalHours, 24 * 30),
    keep: readNumber(repository, KEYS.keep, DEFAULTS.keep, 365),
    ...(publicKey === undefined ? {} : { publicKey }),
  };
}

export function writeStoredSettings(
  repository: SettingsRepository,
  settings: StoredBackupSettings,
  updatedAt: string,
): void {
  if (settings.publicKey === undefined) {
    repository.clear(KEYS.publicKey);
  } else {
    repository.write(KEYS.publicKey, settings.publicKey, updatedAt);
  }

  repository.write(KEYS.intervalHours, String(settings.intervalHours), updatedAt);
  repository.write(KEYS.keep, String(settings.keep), updatedAt);
}

/**
 * The configuration the schedule actually runs with, from both sources.
 *
 * The environment is not merged field by field: if it carries a public key it
 * carries the whole answer, because a half-environment and half-database
 * configuration is the kind of thing nobody can reason about at three in the
 * morning.
 */
export function effectiveBackupConfig(options: {
  environment: BackupConfig;
  stored: StoredBackupSettings;
  dataDir: string;
}): { config: BackupConfig; fromEnvironment: boolean; directory: string } {
  if (options.environment.scheduled) {
    return {
      config: options.environment,
      directory: options.environment.directory,
      fromEnvironment: true,
    };
  }

  const directory = path.join(options.dataDir, DEFAULT_BACKUP_SUBDIR);

  if (options.stored.publicKey === undefined) {
    return { config: { scheduled: false }, directory, fromEnvironment: false };
  }

  return {
    config: {
      directory,
      intervalHours: options.stored.intervalHours,
      keep: options.stored.keep,
      publicKey: options.stored.publicKey,
      scheduled: true,
    },
    directory,
    fromEnvironment: false,
  };
}
