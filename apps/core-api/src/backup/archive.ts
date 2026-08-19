import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { extract, pack } from "tar-stream";

/**
 * The archive half of a backup (ADR 0013): a plain `tar`, so that recovery
 * needs no ESTIA-specific tool. Encryption is applied to the stream by
 * `crypto.ts`; nothing here knows about keys.
 */

/** Entries are written under this prefix, the way `tar` archives usually are. */
const ROOT = "estia";

export interface ArchiveEntry {
  /** Path inside the archive, relative to the archive root. */
  name: string;
  /** Absolute path on disk. */
  source: string;
  size: number;
}

/** Lists a directory recursively, in a stable order so archives are comparable. */
export async function collectFiles(directory: string, prefix = ""): Promise<ArchiveEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: ArchiveEntry[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const source = path.join(directory, entry.name);
    const name = prefix === "" ? entry.name : `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(source, name)));
      continue;
    }

    if (entry.isFile()) {
      files.push({ name, size: (await stat(source)).size, source });
    }
  }

  return files;
}

/** Packs the given files into a tar stream, without loading any of them in memory. */
export function packFiles(files: readonly ArchiveEntry[]): NodeJS.ReadableStream {
  const archive = pack();

  void (async (): Promise<void> => {
    try {
      for (const file of files) {
        // The instance private key and the database keep their own permissions
        // meaning: a restored backup must not be more readable than the original.
        const target = archive.entry({
          mode: 0o600,
          name: `${ROOT}/${file.name}`,
          size: file.size,
        });

        await pipeline(createReadStream(file.source), target);
      }

      archive.finalize();
    } catch (error) {
      archive.destroy(error instanceof Error ? error : new Error("archive failed"));
    }
  })();

  return archive;
}

export class UnsafeArchiveEntryError extends Error {
  public constructor(name: string) {
    super(`Refusing an archive entry that escapes the destination: ${name}`);
    this.name = "UnsafeArchiveEntryError";
  }
}

/**
 * Resolves an entry name to a path inside `destination`, or refuses it.
 *
 * An archive is untrusted input like any other: a `tar` carrying `../../etc`
 * or an absolute path must not be able to write outside where it was asked to
 * (ADR 0013, «da tenere presente»).
 */
export function safeDestination(destination: string, name: string): string {
  const withoutRoot = name.startsWith(`${ROOT}/`) ? name.slice(ROOT.length + 1) : name;

  if (withoutRoot === "" || path.isAbsolute(withoutRoot) || withoutRoot.includes("\0")) {
    throw new UnsafeArchiveEntryError(name);
  }

  const root = path.resolve(destination);
  const target = path.resolve(root, withoutRoot);

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new UnsafeArchiveEntryError(name);
  }

  return target;
}

/** Unpacks a tar stream into `destination`, refusing any entry that escapes it. */
export async function unpackInto(
  source: NodeJS.ReadableStream,
  destination: string,
): Promise<string[]> {
  const written: string[] = [];
  const extractor = extract();

  extractor.on("entry", (header, stream, next) => {
    void (async (): Promise<void> => {
      try {
        if (header.type !== "file") {
          stream.resume();
          stream.on("end", next);
          return;
        }

        const target = safeDestination(destination, header.name);

        await mkdir(path.dirname(target), { mode: 0o700, recursive: true });
        await pipeline(stream, createWriteStream(target, { mode: 0o600 }));

        written.push(target);
        next();
      } catch (error) {
        extractor.destroy(error instanceof Error ? error : new Error("extract failed"));
      }
    })();
  });

  try {
    await pipeline(source, extractor);
  } catch (error) {
    // A half-written restore is worse than none: it would look like a working
    // instance with pieces missing. But two things this cleanup must not do,
    // both learned restoring on real hardware on 2026-08-19:
    //
    // - **remove the destination itself.** In the documented procedure it is a
    //   mount point (`-v …:/restore`), which cannot be removed at all.
    // - **replace the error that caused it.** A destination we cannot write
    //   into is also one we cannot empty, and reporting the cleanup's
    //   `EACCES … rmdir` instead of the failed write sends whoever is
    //   restoring — at the worst possible moment — to look in the wrong place.
    await clearDirectory(destination);

    throw error;
  }

  return written;
}

/** Empties a directory without removing it, and never throws on its own. */
async function clearDirectory(directory: string): Promise<void> {
  try {
    for (const entry of await readdir(directory)) {
      await rm(path.join(directory, entry), { force: true, recursive: true });
    }
  } catch {
    // Deliberately swallowed: the failure that brought us here is the one
    // worth reporting, and this one would hide it.
  }
}
