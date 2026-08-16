import { randomUUID } from "node:crypto";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { BackupConfig } from "@estia/config";
import type { SchemaBackupStatus, SchemaUpgradeView } from "@estia/contracts";

import { pruneArchives } from "../backup/schedule.js";
import { createBackup } from "../backup/service.js";
import { hasTable, openConnection, readSchemaState, runMigrations } from "./database.js";
import { migrations, type Migration } from "./migrations.js";

/**
 * The backup an instance takes of itself before moving its schema forward
 * (ADR 0014).
 *
 * SECURITY_BASELINE §8 makes migrations forward-only and declares that the
 * rollback of an update **is** the restore from a backup. The scheduled backup
 * of ADR 0013 runs a minute after boot, which is a minute too late: by then the
 * migrations have been applied and the most recent point of return is the one
 * from the night before.
 *
 * The hard part is an ordering one, and it is why opening and migrating had to
 * become two gestures: `VACUUM INTO` opens the database, and the old
 * `openDatabase()` migrated while opening it. Here the instance closes its own
 * connection before the snapshot and reopens after, so that nothing else of
 * ours is holding the file while the copy is taken.
 */

export interface UpgradeLogger {
  info(details: Record<string, unknown>, message: string): void;
  warn(details: Record<string, unknown>, message: string): void;
  error(details: Record<string, unknown>, message: string): void;
}

export interface PreparedDatabase {
  database: DatabaseSync;
  /**
   * The last schema upgrade this instance went through, whether it happened on
   * this boot or on an earlier one. Absent on an instance whose schema has
   * never moved since it was created.
   */
  upgrade?: SchemaUpgradeView;
}

export interface PrepareDatabaseOptions {
  dataDir: string;
  backup: BackupConfig;
  logger: UpgradeLogger;
  /** Injectable so tests can build a database of an older version for real. */
  migrations?: readonly Migration[];
  now?: () => Date;
}

function countOf(n: number): string {
  return n === 1 ? "una migrazione" : `${String(n)} migrazioni`;
}

/**
 * Opens the database, backing the instance up first if there are migrations to
 * apply, and never refusing to start.
 *
 * That last part is the decision, not an omission: refusing to boot would
 * protect the data by leaving a neighbourhood without its board — a certain
 * harm against a possible risk. What the instance owes instead is to say so, in
 * the logs and to whoever administers it, and to keep saying it afterwards.
 */
export async function prepareDatabase(options: PrepareDatabaseOptions): Promise<PreparedDatabase> {
  const list = options.migrations ?? migrations;
  const now = options.now ?? ((): Date => new Date());

  let database = openConnection(options.dataDir);
  const state = readSchemaState(database, list);

  if (state.pending.length === 0) {
    return { database, ...pack(readLastUpgrade(database)) };
  }

  // A database that has never been migrated is a new instance, not an upgrade:
  // there are no contents and no instance key yet, so an archive here would be
  // noise — and noise teaches people to ignore exactly the messages this exists
  // to make visible (ADR 0014, punto 3).
  if (state.fresh) {
    runMigrations(database, list);

    return { database };
  }

  const startedAt = now();

  // Closed before the snapshot and reopened after. WAL would tolerate the two
  // connections — it is what the nightly backup does on a live instance — but
  // DDL is about to be written, and at boot nobody is waiting on a reopen.
  database.close();

  const backup = await takeBackup(options, startedAt);

  database = openConnection(options.dataDir);

  const applied = runMigrations(database, list);
  const toVersion = applied.at(-1)?.version ?? state.currentVersion;

  const upgrade: SchemaUpgradeView = {
    appliedAt: startedAt.toISOString(),
    backupStatus: backup.status,
    ...(backup.name === undefined ? {} : { backupName: backup.name }),
    detail: detailFor(backup, applied.length),
    fromVersion: state.currentVersion,
    migrationCount: applied.length,
    toVersion,
  };

  record(database, upgrade);
  announce(options.logger, upgrade);

  return { database, upgrade };
}

interface BackupOutcome {
  status: SchemaBackupStatus;
  name?: string;
  reason?: string;
}

async function takeBackup(options: PrepareDatabaseOptions, now: Date): Promise<BackupOutcome> {
  if (!options.backup.scheduled) {
    return { status: "not_configured" };
  }

  const config = options.backup;

  try {
    const result = await createBackup({
      dataDir: options.dataDir,
      destination: config.directory,
      family: "upgrade",
      now: () => now,
      recipient: { kind: "publicKey", value: config.publicKey },
    });

    const name = path.basename(result.path);

    try {
      await pruneArchives(config.directory, config.keep, "upgrade");
    } catch (error) {
      // The archive is written; failing to tidy up around it does not make it
      // any less of a point of return.
      options.logger.warn(
        { err: error, event: "schema_backup_prune_failed" },
        "Non sono riuscito a ruotare i backup di aggiornamento",
      );
    }

    return { name, status: "created" };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : "motivo sconosciuto",
      status: "failed",
    };
  }
}

function detailFor(backup: BackupOutcome, count: number): string {
  if (backup.status === "created") {
    return `Prima di applicare ${countOf(count)} l'istanza ha scritto un backup cifrato: ${backup.name ?? ""}. È il punto di ritorno di questo aggiornamento.`;
  }

  if (backup.status === "not_configured") {
    return `L'istanza ha applicato ${countOf(count)} senza scrivere un backup, perché non ne è configurato nessuno. Le migrazioni vanno solo in avanti: questo aggiornamento non ha un punto di ritorno, e non potrà averlo dopo. Imposta ESTIA_BACKUP_DIR e ESTIA_BACKUP_PUBLIC_KEY perché il prossimo ce l'abbia.`;
  }

  return `Il backup che doveva precedere ${countOf(count)} non è riuscito (${backup.reason ?? "motivo sconosciuto"}), e le migrazioni sono state applicate lo stesso per non lasciare l'istanza ferma. Questo aggiornamento non ha un punto di ritorno: i backup che credi di avere non stanno funzionando, e vanno controllati adesso.`;
}

/**
 * Says it in the logs too, with the volume the case deserves.
 *
 * A missing backup is a reminder of something the administrator chose; a failed
 * one is an administrator who believes they are protected and is not. It is the
 * same asymmetry as `at_rest_mismatch` in ADR 0007.
 */
function announce(logger: UpgradeLogger, upgrade: SchemaUpgradeView): void {
  const details = {
    backupStatus: upgrade.backupStatus,
    fromVersion: upgrade.fromVersion,
    migrationCount: upgrade.migrationCount,
    toVersion: upgrade.toVersion,
  };

  if (upgrade.backupStatus === "created") {
    logger.info(
      { ...details, backupName: upgrade.backupName, event: "schema_migrated" },
      "Schema aggiornato, con un backup scritto prima",
    );

    return;
  }

  if (upgrade.backupStatus === "not_configured") {
    logger.warn(
      { ...details, event: "schema_migrated_without_backup" },
      "Schema aggiornato senza backup: questo aggiornamento non ha un punto di ritorno",
    );

    return;
  }

  logger.error(
    { ...details, event: "schema_backup_failed" },
    "Il backup prima delle migrazioni è fallito: lo schema è stato aggiornato senza punto di ritorno",
  );
}

interface UpgradeRow {
  applied_at: string;
  from_version: number;
  to_version: number;
  migration_count: number;
  backup_status: SchemaBackupStatus;
  backup_name: string | null;
  detail: string;
}

/**
 * Written into the database, not only into the logs (ADR 0014, punto 5).
 *
 * Guarded on the table existing so that a caller migrating to a version before
 * this table simply records nothing, instead of failing a boot over its own
 * bookkeeping.
 */
function record(database: DatabaseSync, upgrade: SchemaUpgradeView): void {
  if (!hasTable(database, "schema_upgrades")) {
    return;
  }

  database
    .prepare(
      `INSERT INTO schema_upgrades
         (id, from_version, to_version, migration_count, applied_at, backup_status, backup_name, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      upgrade.fromVersion,
      upgrade.toVersion,
      upgrade.migrationCount,
      upgrade.appliedAt,
      upgrade.backupStatus,
      upgrade.backupName ?? null,
      upgrade.detail,
    );
}

export function readLastUpgrade(database: DatabaseSync): SchemaUpgradeView | undefined {
  if (!hasTable(database, "schema_upgrades")) {
    return undefined;
  }

  const row = database
    .prepare(
      `SELECT applied_at, from_version, to_version, migration_count, backup_status, backup_name, detail
       FROM schema_upgrades ORDER BY applied_at DESC LIMIT 1`,
    )
    .get() as UpgradeRow | undefined;

  if (row === undefined) {
    return undefined;
  }

  return {
    appliedAt: row.applied_at,
    backupStatus: row.backup_status,
    ...(row.backup_name === null ? {} : { backupName: row.backup_name }),
    detail: row.detail,
    fromVersion: row.from_version,
    migrationCount: row.migration_count,
    toVersion: row.to_version,
  };
}

/** Keeps `exactOptionalPropertyTypes` happy without spreading `undefined`. */
function pack(upgrade: SchemaUpgradeView | undefined): { upgrade?: SchemaUpgradeView } {
  return upgrade === undefined ? {} : { upgrade };
}
