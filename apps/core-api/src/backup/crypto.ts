import { Decrypter, Encrypter, generateIdentity, identityToRecipient } from "age-encryption";

/**
 * The encryption half of a backup (ADR 0013).
 *
 * The format is `age`, chosen because it is a specification with independent
 * implementations rather than a library of ours: an archive stays readable with
 * the standard `age` tool, without ESTIA, which is what makes a backup a real
 * way out and not a hostage.
 */

/** How the instance was told to encrypt. */
export type BackupRecipient =
  { kind: "publicKey"; value: string } | { kind: "passphrase"; value: string };

export class BackupKeyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BackupKeyError";
  }
}

/**
 * A fresh key pair for backups. The private half is shown once and must leave
 * the instance; only the public half is ever configured on it, so an instance
 * makes backups it cannot itself read.
 */
export async function createBackupKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
  const privateKey = await generateIdentity();

  return { privateKey, publicKey: await identityToRecipient(privateKey) };
}

function encrypterFor(recipient: BackupRecipient): Encrypter {
  const encrypter = new Encrypter();

  if (recipient.kind === "passphrase") {
    if (recipient.value.length < 12) {
      throw new BackupKeyError("La passphrase di backup è troppo corta.");
    }

    encrypter.setPassphrase(recipient.value);

    return encrypter;
  }

  try {
    encrypter.addRecipient(recipient.value);
  } catch {
    // Said now, at configuration time, rather than at the first nightly backup.
    throw new BackupKeyError("La chiave pubblica di backup non è una chiave age valida.");
  }

  return encrypter;
}

/**
 * Encrypts a whole archive.
 *
 * `age-encryption` 0.3.0 works on a complete buffer rather than a stream, so an
 * archive is held in memory while it is encrypted. For an instance of a few
 * dozen members that is measured in hundreds of megabytes at most; when it
 * stops being true, this is the one function that changes.
 */
export async function encryptArchive(
  archive: Uint8Array,
  recipient: BackupRecipient,
): Promise<Uint8Array> {
  return encrypterFor(recipient).encrypt(archive);
}

export async function decryptArchive(
  encrypted: Uint8Array,
  key: { kind: "privateKey" | "passphrase"; value: string },
): Promise<Uint8Array> {
  const decrypter = new Decrypter();

  if (key.kind === "passphrase") {
    decrypter.addPassphrase(key.value);
  } else {
    try {
      decrypter.addIdentity(key.value);
    } catch {
      throw new BackupKeyError("La chiave privata di backup non è una chiave age valida.");
    }
  }

  try {
    return await decrypter.decrypt(encrypted);
  } catch {
    // age authenticates what it encrypts, so this covers both a wrong key and a
    // damaged archive. Either way the honest answer is that it cannot be read.
    throw new BackupKeyError(
      "Non riesco ad aprire questo backup: chiave sbagliata, o archivio danneggiato.",
    );
  }
}
