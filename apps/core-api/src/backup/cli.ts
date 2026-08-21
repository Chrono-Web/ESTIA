import process from "node:process";

import { loadDataDir } from "@estia/config";

import { createBackupKeyPair, type BackupRecipient } from "./crypto.js";
import { createBackup, restoreBackup } from "./service.js";

/**
 * Backup and restore from the command line, deliberately not from the API.
 *
 * An administrator needs these most when the instance is in trouble, and a
 * procedure that requires a working web interface is a procedure that fails
 * exactly when it matters. This runs against the data directory, not against a
 * running server.
 */

const USAGE = `
ESTIA — backup e ripristino

  node dist/backup/cli.js chiavi
      Genera una coppia di chiavi per i backup. La privata viene mostrata una
      volta sola e deve uscire dall'istanza: senza di essa i backup non si
      riaprono, e nessuno puo' recuperarli.

  node dist/backup/cli.js backup <directory-di-destinazione>
      Crea un backup cifrato. La chiave pubblica si passa in
      ESTIA_BACKUP_PUBLIC_KEY, oppure una passphrase in ESTIA_BACKUP_PASSPHRASE.

  node dist/backup/cli.js ripristina <archivio> <directory-vuota>
      Ripristina un archivio. La chiave privata si passa in
      ESTIA_BACKUP_PRIVATE_KEY, oppure la passphrase in ESTIA_BACKUP_PASSPHRASE.

Un archivio e' un tar cifrato con age: si apre anche senza ESTIA, con
    age -d -i chiave.txt archivio.tar.age | tar -xv
`;

function recipientFromEnvironment(): BackupRecipient {
  const publicKey = process.env.ESTIA_BACKUP_PUBLIC_KEY;
  const passphrase = process.env.ESTIA_BACKUP_PASSPHRASE;

  if (publicKey !== undefined && publicKey.trim() !== "") {
    return { kind: "publicKey", value: publicKey.trim() };
  }

  if (passphrase !== undefined && passphrase !== "") {
    return { kind: "passphrase", value: passphrase };
  }

  throw new Error("Serve ESTIA_BACKUP_PUBLIC_KEY (consigliata) oppure ESTIA_BACKUP_PASSPHRASE.");
}

function keyFromEnvironment(): { kind: "privateKey" | "passphrase"; value: string } {
  const privateKey = process.env.ESTIA_BACKUP_PRIVATE_KEY;
  const passphrase = process.env.ESTIA_BACKUP_PASSPHRASE;

  if (privateKey !== undefined && privateKey.trim() !== "") {
    return { kind: "privateKey", value: privateKey.trim() };
  }

  if (passphrase !== undefined && passphrase !== "") {
    return { kind: "passphrase", value: passphrase };
  }

  throw new Error("Serve ESTIA_BACKUP_PRIVATE_KEY oppure ESTIA_BACKUP_PASSPHRASE.");
}

async function main(): Promise<void> {
  const [command, first, second] = process.argv.slice(2);

  if (command === undefined || command === "aiuto" || command === "--help") {
    process.stdout.write(USAGE);
    return;
  }

  if (command === "chiavi") {
    const pair = await createBackupKeyPair();

    // Written to stdout and never through the logger, like the setup token:
    // a key must not end up in a log collection (SECURITY_BASELINE §7).
    process.stdout.write(
      [
        "",
        "  Chiave PUBBLICA — va nella configurazione dell'istanza:",
        "",
        `      ${pair.publicKey}`,
        "",
        "  Chiave PRIVATA — mostrata una volta sola, conservala FUORI dal NAS:",
        "",
        `      ${pair.privateKey}`,
        "",
        "  L'istanza con la sola chiave pubblica produce backup che non sa rileggere.",
        "  Chi perde la chiave privata perde gli archivi: non sono recuperabili.",
        "",
        "",
      ].join("\n"),
    );
    return;
  }

  // Only the data directory, never the whole server configuration: these
  // commands work on a directory, and an instance without scheduled backups
  // must still be able to take a manual one.
  const dataDir = loadDataDir(process.env);

  if (command === "backup") {
    if (first === undefined) {
      throw new Error("Manca la directory di destinazione.");
    }

    const result = await createBackup({
      dataDir,
      destination: first,
      recipient: recipientFromEnvironment(),
    });

    process.stdout.write(
      `\x1b[32m✅ Backup creato con successo:\x1b[0m ${result.path}\n` +
      `📦 \x1b[36m${String(result.fileCount)}\x1b[0m file, \x1b[36m${String(result.byteSize)}\x1b[0m byte cifrati al sicuro.\n`,
    );
    return;
  }

  if (command === "ripristina") {
    if (first === undefined || second === undefined) {
      throw new Error("Servono l'archivio e una directory vuota di destinazione.");
    }

    const written = await restoreBackup({
      archive: first,
      destination: second,
      key: keyFromEnvironment(),
    });

    process.stdout.write(
      `\x1b[32m✅ Operazione completata!\x1b[0m\n` +
      `📦 Ripristinati \x1b[36m${String(written.length)}\x1b[0m file in ${second}\n` +
      `🚀 Avvia l'istanza puntando a questa cartella: \x1b[33mESTIA_DATA_DIR=${second}\x1b[0m\n`,
    );
    return;
  }

  throw new Error(`Comando sconosciuto: ${command}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`\x1b[31m❌ ERRORE:\x1b[0m ${error instanceof Error ? error.message : "Errore imprevisto."}\n`);
  process.exitCode = 1;
});
