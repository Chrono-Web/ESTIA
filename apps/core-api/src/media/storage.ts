import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, rename, rm, stat, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

export interface StoredFile {
  byteSize: number;
  modifiedAt: Date;
}

/**
 * The port the domain depends on (PROJECT_SPEC §9): atomic write, read,
 * existence, deletion and metadata. Nothing else, so that a different backing
 * store stays a matter of writing another adapter.
 *
 * A key is a relative path built by the caller from identifiers it generated.
 * It is never derived from the name of an uploaded file.
 */
export interface MediaStorage {
  write(key: string, bytes: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  stat(key: string): Promise<StoredFile | undefined>;
}

/** Opaque identifiers and one extension. Anything else is a bug, or an attack. */
const SAFE_KEY = /^[a-f0-9]{2}\/[a-zA-Z0-9._-]{1,80}$/;

export class InvalidStorageKeyError extends Error {
  public constructor(key: string) {
    super(`Refusing a storage key that is not a plain identifier: ${key}`);
    this.name = "InvalidStorageKeyError";
  }
}

/**
 * Files under a single root directory, with two defences that hold even if a
 * caller gets it wrong: the key has to match a strict shape, and the resolved
 * path has to stay inside the root.
 */
export class FilesystemMediaStorage implements MediaStorage {
  public constructor(private readonly root: string) {}

  public async write(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.resolve(key);

    await mkdir(path.dirname(target), { mode: 0o700, recursive: true });

    // Written beside the target and moved into place: a rename within the same
    // filesystem is atomic, so a reader never sees a half-written image, and a
    // failure leaves a temporary file rather than a corrupt one
    // (ARCHITECTURE §5).
    const temporary = `${target}.${randomUUID()}.part`;

    try {
      await writeFile(temporary, bytes, { mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });

      throw error;
    }
  }

  public async read(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(key)));
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key), constants.F_OK);

      return true;
    } catch {
      return false;
    }
  }

  public async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  public async stat(key: string): Promise<StoredFile | undefined> {
    try {
      const stats = await stat(this.resolve(key));

      return { byteSize: stats.size, modifiedAt: stats.mtime };
    } catch {
      return undefined;
    }
  }

  private resolve(key: string): string {
    if (!SAFE_KEY.test(key)) {
      throw new InvalidStorageKeyError(key);
    }

    const target = path.resolve(this.root, key);

    // Belt and braces: even a key that satisfied the pattern must land inside.
    if (
      target !== path.resolve(this.root) &&
      !target.startsWith(path.resolve(this.root) + path.sep)
    ) {
      throw new InvalidStorageKeyError(key);
    }

    return target;
  }
}
