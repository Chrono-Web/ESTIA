import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { collectFiles, packFiles, unpackInto, type ArchiveEntry } from "./archive.js";
import { decryptArchive, encryptArchive, type BackupRecipient } from "./crypto.js";

/**
 * Backup and restore of a whole instance (ADR 0013).
 *
 * What goes in is everything an instance needs to be itself again: the
 * database, the media, and the instance private key — without which a restored
 * instance is a stranger to its own members (SECURITY_BASELINE §6, punto 3).
 */

/** Work area for the database snapshot. Inside the data directory, so it has room. */
const WORK_DIR = ".backup-work";

const README = `Backup di un'istanza ESTIA.

Questo archivio e' un tar cifrato con age (https://age-encryption.org), e si
apre con strumenti standard, senza ESTIA:

    age -d -i LA-TUA-CHIAVE-PRIVATA.txt backup.tar.age | tar -xv

Dentro trovi:

    estia/estia.db               il database dell'istanza
    estia/instance-identity.pem  la chiave privata dell'istanza
    estia/media/                 le immagini pubblicate

La chiave privata dell'istanza e' il segreto piu' critico del sistema e non e'
sostituibile: senza di essa un ripristino produce un'istanza che i membri non
riconoscono piu'. Tratta questo archivio di conseguenza.
`;

export interface BackupResult {
  /** Where the encrypted archive was written. */
  path: string;
  byteSize: number;
  /** How many files it holds, the readme aside. */
  fileCount: number;
}

/**
 * Which family an archive belongs to (ADR 0014, punto 6).
 *
 * The one written just before migrations is the most valuable archive an
 * instance ever produces, and it is kept apart so that the ordinary rotation
 * cannot delete it: with `ESTIA_BACKUP_KEEP=1` the following night would
 * otherwise remove the only point of return of that upgrade.
 */
export type ArchiveFamily = "scheduled" | "upgrade";

const FAMILY_PREFIX: Record<ArchiveFamily, string> = {
  scheduled: "estia-",
  upgrade: "estia-aggiornamento-",
};

export interface CreateBackupOptions {
  dataDir: string;
  destination: string;
  recipient: BackupRecipient;
  family?: ArchiveFamily;
  now?: () => Date;
}

/** `estia-2026-08-15T09-30-00Z.tar.age`: sorts chronologically, safe on every filesystem. */
export function backupFileName(now: Date, family: ArchiveFamily = "scheduled"): string {
  return `${FAMILY_PREFIX[family]}${now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "Z")}.tar.age`;
}

export async function createBackup(options: CreateBackupOptions): Promise<BackupResult> {
  const now = options.now ?? ((): Date => new Date());
  const work = path.join(options.dataDir, WORK_DIR);

  await rm(work, { force: true, recursive: true });
  await mkdir(work, { mode: 0o700, recursive: true });

  try {
    const snapshot = path.join(work, "estia.db");

    // A consistent copy of a live database, in one file and with no WAL beside
    // it: the instance does not need to be stopped (ADR 0013).
    snapshotDatabase(path.join(options.dataDir, "estia.db"), snapshot);

    await writeFile(path.join(work, "LEGGIMI.txt"), README, { mode: 0o600 });

    const entries: ArchiveEntry[] = [
      {
        name: "LEGGIMI.txt",
        size: (await stat(path.join(work, "LEGGIMI.txt"))).size,
        source: path.join(work, "LEGGIMI.txt"),
      },
      { name: "estia.db", size: (await stat(snapshot)).size, source: snapshot },
    ];

    const identity = path.join(options.dataDir, "instance-identity.pem");

    if (existsSync(identity)) {
      entries.push({
        name: "instance-identity.pem",
        size: (await stat(identity)).size,
        source: identity,
      });
    }

    // The database first, then the media: a media row exists only once its
    // files are on disk, so everything the snapshot mentions is already there
    // to be copied (ADR 0013).
    const mediaDir = path.join(options.dataDir, "media");

    if (existsSync(mediaDir)) {
      for (const file of await collectFiles(mediaDir, "media")) {
        entries.push(file);
      }
    }

    const archive = await readStream(packFiles(entries));
    const encrypted = await encryptArchive(archive, options.recipient);
    const target = path.join(options.destination, backupFileName(now(), options.family));

    await mkdir(options.destination, { mode: 0o700, recursive: true });
    await writeFile(target, encrypted, { mode: 0o600 });

    return { byteSize: encrypted.byteLength, fileCount: entries.length - 1, path: target };
  } finally {
    await rm(work, { force: true, recursive: true });
  }
}

export interface RestoreOptions {
  archive: string;
  destination: string;
  key: { kind: "privateKey" | "passphrase"; value: string };
}

/**
 * Restores an archive into an empty directory.
 *
 * It refuses to write into a directory that already holds an instance: a
 * restore that silently merged into live data would be the worst possible way
 * to discover a mistake.
 */
export async function restoreBackup(options: RestoreOptions): Promise<string[]> {
  if (existsSync(path.join(options.destination, "estia.db"))) {
    throw new Error(
      `In ${options.destination} c'è già un'istanza: scegli una directory vuota e sposta i file solo quando il ripristino è riuscito.`,
    );
  }

  const decrypted = await decryptArchive(
    new Uint8Array(await readFile(options.archive)),
    options.key,
  );

  await mkdir(options.destination, { mode: 0o700, recursive: true });

  const { Readable } = await import("node:stream");

  return unpackInto(Readable.from(Buffer.from(decrypted)), options.destination);
}

function snapshotDatabase(source: string, target: string): void {
  const database = new DatabaseSync(source);

  try {
    // The path is ours, never user input, but it still goes in as a literal —
    // and a quote in it would be a bug worth failing on rather than escaping.
    if (target.includes("'")) {
      throw new Error("Il percorso dello snapshot contiene un apice.");
    }

    database.exec(`VACUUM INTO '${target}'`);
  } finally {
    database.close();
  }
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }

  return new Uint8Array(Buffer.concat(chunks));
}
