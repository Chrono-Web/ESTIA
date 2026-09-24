import { chown, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

import { loadDataDir } from "@estia/config";

import { consoleTranslator, terminalStyle } from "../console.js";
import {
  backupDoneText,
  CliProblem,
  errorText,
  keyPairText,
  privateKeyPromptText,
  privateKeyQuestion,
  restoreDoneText,
  usageText,
} from "./cli-text.js";
import { createBackupKeyPair, type BackupRecipient } from "./crypto.js";
import { createBackup, restoreBackup } from "./service.js";

/**
 * Backup and restore from the command line, deliberately not from the API.
 *
 * An administrator needs these most when the instance is in trouble, and a
 * procedure that requires a working web interface is a procedure that fails
 * exactly when it matters. This runs against the data directory, not against a
 * running server.
 *
 * It speaks the language of its environment (ADR 0044 §3): `ESTIA_LANG`, which
 * the installer sets on the container and `estia` passes on every call.
 */

const translator = consoleTranslator(process.env);
const style = terminalStyle((process.env.NO_COLOR ?? "") === "");

function recipientFromEnvironment(): BackupRecipient {
  const publicKey = process.env.ESTIA_BACKUP_PUBLIC_KEY;
  const passphrase = process.env.ESTIA_BACKUP_PASSPHRASE;

  if (publicKey !== undefined && publicKey.trim() !== "") {
    return { kind: "publicKey", value: publicKey.trim() };
  }

  if (passphrase !== undefined && passphrase !== "") {
    return { kind: "passphrase", value: passphrase };
  }

  throw new CliProblem("server.backup_cli.error.no_recipient");
}

async function resolveKey(): Promise<{ kind: "privateKey" | "passphrase"; value: string }> {
  const privateKey = process.env.ESTIA_BACKUP_PRIVATE_KEY;
  const passphrase = process.env.ESTIA_BACKUP_PASSPHRASE;

  if (privateKey !== undefined && privateKey.trim() !== "") {
    return { kind: "privateKey", value: privateKey.trim() };
  }

  if (passphrase !== undefined && passphrase !== "") {
    return { kind: "passphrase", value: passphrase };
  }

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    process.stdout.write(privateKeyPromptText(translator, style));

    try {
      const answer = await rl.question(privateKeyQuestion(translator, style));
      if (answer.trim() === "") {
        throw new CliProblem("server.backup_cli.error.empty_key");
      }
      return { kind: "privateKey", value: answer.trim() };
    } finally {
      rl.close();
    }
  }

  throw new CliProblem("server.backup_cli.error.no_key");
}

async function fixPermissions(targetDir: string, uid: number, gid: number): Promise<void> {
  try {
    await chown(targetDir, uid, gid);
    const entries = await readdir(targetDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(entry.parentPath ?? targetDir, entry.name);
      try {
        await chown(full, uid, gid);
      } catch {
        // file could have been removed
      }
    }
  } catch {
    // ignore permission adjustment failure if not supported
  }
}

async function main(): Promise<void> {
  const [command, first, second] = process.argv.slice(2);

  if (command === undefined || command === "aiuto" || command === "help" || command === "--help") {
    process.stdout.write(usageText(translator, style));
    return;
  }

  if (command === "chiavi") {
    const pair = await createBackupKeyPair();

    // Written to stdout and never through the logger, like the setup token:
    // a key must not end up in a log collection (SECURITY_BASELINE §7).
    process.stdout.write(keyPairText(translator, style, pair));
    return;
  }

  // Only the data directory, never the whole server configuration: these
  // commands work on a directory, and an instance without scheduled backups
  // must still be able to take a manual one.
  const dataDir = loadDataDir(process.env);

  if (command === "backup") {
    if (first === undefined) {
      throw new CliProblem("server.backup_cli.error.no_destination");
    }

    const result = await createBackup({
      dataDir,
      destination: first,
      recipient: recipientFromEnvironment(),
    });

    process.stdout.write(backupDoneText(translator, style, result));
    return;
  }

  if (command === "ripristina") {
    if (first === undefined || second === undefined) {
      throw new CliProblem("server.backup_cli.error.no_archive");
    }

    const force =
      process.argv.includes("--sovrascrivi") ||
      process.argv.includes("--force") ||
      process.argv.includes("-f");

    const key = await resolveKey();

    const written = await restoreBackup({
      archive: first,
      destination: second,
      key,
      force,
    });

    if (typeof process.getuid === "function" && process.getuid() === 0) {
      await fixPermissions(second, 10001, 10001);
    }

    process.stdout.write(
      restoreDoneText(translator, style, { destination: second, fileCount: written.length }),
    );
    return;
  }

  throw new CliProblem("server.backup_cli.error.unknown_command", { command });
}

main().catch((error: unknown) => {
  process.stderr.write(errorText(translator, style, error));
  process.exitCode = 1;
});
