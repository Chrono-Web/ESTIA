import { createReadStream, existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { BackupConfig } from "@estia/config";
import type { BackupArchiveView, BackupSettingsView, UpdateBackupSettings } from "@estia/contracts";

import { DomainError } from "../errors.js";
import { createBackupKeyPair } from "./crypto.js";
import type { BackupSchedule } from "./schedule.js";
import {
  effectiveBackupConfig,
  readStoredSettings,
  writeStoredSettings,
  type SettingsRepository,
} from "./settings.js";

/**
 * Everything an administrator needs to do with backups, minus the one thing
 * that must not live here (ADR 0016): restoring, which is needed exactly when
 * this interface is unreachable.
 */

/**
 * The only names this will ever open. Archives are what the instance itself
 * wrote, and a name arriving from the network is otherwise a way to ask for
 * any file on the NAS.
 */
const ARCHIVE_NAME = /^estia-(aggiornamento-)?[0-9TZ:.-]{1,40}\.tar\.age$/;

export interface BackupSettingsServiceOptions {
  repository: SettingsRepository;
  schedule: BackupSchedule;
  environment: BackupConfig;
  dataDir: string;
  now?: () => Date;
}

export class BackupSettingsService {
  private readonly now: () => Date;

  public constructor(private readonly options: BackupSettingsServiceOptions) {
    this.now = options.now ?? ((): Date => new Date());
  }

  /** The configuration the schedule should be running with, right now. */
  public resolve(): { config: BackupConfig; fromEnvironment: boolean; directory: string } {
    return effectiveBackupConfig({
      dataDir: this.options.dataDir,
      environment: this.options.environment,
      stored: readStoredSettings(this.options.repository),
    });
  }

  public view(): BackupSettingsView {
    const { config, directory, fromEnvironment } = this.resolve();
    const stored = readStoredSettings(this.options.repository);

    return {
      configured: config.scheduled,
      directory,
      // Said out loud whenever it is true: an archive beside the data is half a
      // backup, and the half it is missing is the one about a broken disk.
      directoryIsBesideData: !this.options.environment.scheduled,
      editable: !fromEnvironment,
      intervalHours: config.scheduled ? config.intervalHours : stored.intervalHours,
      keep: config.scheduled ? config.keep : stored.keep,
      ...(config.scheduled ? { publicKey: config.publicKey } : {}),
      source: fromEnvironment ? "environment" : "panel",
    };
  }

  /**
   * A fresh pair. The private half is returned once and never stored: from here
   * on the instance holds only the public one, and cannot read its own archives
   * (ADR 0013).
   */
  public async createKeys(): Promise<{ publicKey: string; privateKey: string }> {
    return createBackupKeyPair();
  }

  public update(settings: UpdateBackupSettings): BackupSettingsView {
    if (!this.view().editable) {
      throw new DomainError(
        "backup_settings_from_environment",
        "Questi backup sono configurati da variabili d'ambiente: cambiali nel file di configurazione del container.",
        409,
      );
    }

    const publicKey = settings.publicKey?.trim() ?? "";

    // The dangerous mistake first, because the generic message would hide it.
    if (publicKey.toUpperCase().startsWith("AGE-SECRET-KEY")) {
      throw new DomainError(
        "backup_private_key_offered",
        "Questa è la chiave PRIVATA. Sull'istanza va solo quella pubblica: è ciò che le impedisce di rileggere i propri backup.",
        400,
      );
    }

    if (publicKey !== "" && !publicKey.startsWith("age1")) {
      throw new DomainError(
        "backup_public_key_invalid",
        "La chiave pubblica di backup deve iniziare con «age1».",
        400,
      );
    }

    writeStoredSettings(
      this.options.repository,
      {
        intervalHours: settings.intervalHours,
        keep: settings.keep,
        ...(publicKey === "" ? {} : { publicKey }),
      },
      this.now().toISOString(),
    );

    // Re-armed without a restart, which is the whole point of ADR 0016.
    this.options.schedule.configure(this.resolve().config);

    return this.view();
  }

  public async runNow(): Promise<BackupArchiveView> {
    const { config } = this.resolve();

    if (!config.scheduled) {
      throw new DomainError(
        "backup_not_configured",
        "Prima serve una chiave pubblica di backup.",
        409,
      );
    }

    const result = await this.options.schedule.runNow();
    const name = path.basename(result.path);

    return {
      byteSize: result.byteSize,
      modifiedAt: this.now().toISOString(),
      name,
    };
  }

  /** Newest first: the one an administrator wants is almost always the last one. */
  public async list(): Promise<BackupArchiveView[]> {
    const { directory } = this.resolve();
    const archives: BackupArchiveView[] = [];

    let names: string[];

    try {
      names = await readdir(directory);
    } catch {
      return [];
    }

    for (const name of names.filter((candidate) => ARCHIVE_NAME.test(candidate))) {
      const stats = await stat(path.join(directory, name));

      archives.push({
        byteSize: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        name,
      });
    }

    return archives.sort((a, b) => b.name.localeCompare(a.name));
  }

  /**
   * Opens one archive for download, by name and only by name.
   *
   * The name is matched against the shape the instance writes and then joined
   * to a directory the instance chose: a `..` never survives the pattern, and
   * the check below refuses anything that somehow escaped anyway.
   */
  public open(name: string): { stream: NodeJS.ReadableStream; name: string } {
    const { directory } = this.resolve();

    if (!ARCHIVE_NAME.test(name)) {
      throw new DomainError("backup_archive_unknown", "Archivio non trovato.", 404);
    }

    const file = path.join(directory, name);

    if (path.dirname(file) !== directory || !existsSync(file)) {
      // Checked before opening, not after: `createReadStream` on a missing file
      // fails asynchronously, and the caller would already have committed to
      // sending a body that never arrives.
      throw new DomainError("backup_archive_unknown", "Archivio non trovato.", 404);
    }

    // Streamed, never read into memory: an archive is the size of the instance,
    // and ADR 0013 already measured what holding one costs.
    return { name, stream: createReadStream(file) };
  }
}
