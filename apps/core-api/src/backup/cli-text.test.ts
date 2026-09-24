import { describe, expect, it } from "vitest";

import { consoleTranslator, displayWidth, terminalStyle } from "../console.js";
import { UnsafeArchiveEntryError } from "./archive.js";
import {
  backupDoneText,
  CliProblem,
  errorText,
  keyPairText,
  privateKeyPromptText,
  restoreDoneText,
  usageText,
} from "./cli-text.js";
import { BackupKeyError } from "./crypto.js";
import { RestoreDestinationOccupiedError } from "./service.js";

const plain = terminalStyle(false);
const it_ = consoleTranslator({ ESTIA_LANG: "it" });
const en = consoleTranslator({ ESTIA_LANG: "en" });

describe("la CLI dei backup parla la lingua di chi la usa (ADR 0044)", () => {
  it("l'aiuto in italiano è quello di sempre", () => {
    const usage = usageText(it_, plain);

    expect(usage).toContain(
      "║  🔐 ESTIA — Backup e ripristino                                    ║",
    );
    expect(usage).toContain(
      [
        "   ├── node dist/backup/cli.js chiavi",
        "   │   Genera una coppia di chiavi per i backup. La privata viene mostrata una",
        "   │   volta sola e deve uscire dall'istanza: senza di essa i backup non si",
        "   │   riaprono, e nessuno puo' recuperarli.",
        "   │",
        "   ├── node dist/backup/cli.js backup <directory-di-destinazione>",
      ].join("\n"),
    );
    expect(usage).toContain(
      "   └── node dist/backup/cli.js ripristina <archivio> <directory-di-destinazione> [--sovrascrivi]\n       Ripristina un archivio.",
    );
    expect(usage).toContain(
      "📖 Un archivio e' un tar cifrato con age: si apre anche senza ESTIA, con\n   age -d -i chiave.txt archivio.tar.age | tar -xv",
    );
  });

  it("in inglese traduce le frasi e non i comandi", () => {
    const usage = usageText(en, plain);

    expect(usage).toContain("ESTIA — Backup and restore");
    expect(usage).toContain("node dist/backup/cli.js chiavi");
    expect(usage).toContain(
      "node dist/backup/cli.js ripristina <archive> <destination-directory> [--sovrascrivi]",
    );
    expect(usage).toContain("Generates a key pair for backups.");
    expect(usage).not.toMatch(/Genera una|Ripristina un|server\.backup_cli/);
  });

  it("la cornice ha i bordi allineati anche quando una riga è lunga", () => {
    const righe = privateKeyPromptText(en, plain).split("\n").filter(Boolean);

    expect(new Set(righe.map(displayWidth)).size).toBe(1);
    expect(righe.join("\n")).toContain("Paste your PRIVATE KEY");
    expect(righe.join("\n")).toContain("(the one starting with AGE-SECRET-KEY-1...)");
  });

  it("le chiavi generate si annunciano nella lingua giusta, e le chiavi restano come sono", () => {
    const pair = { privateKey: "AGE-SECRET-KEY-1ABC", publicKey: "age1xyz" };

    expect(keyPairText(it_, plain, pair)).toContain(
      "🔐 Chiave PRIVATA — mostrata una volta sola, conservala FUORI DAL NAS:",
    );
    expect(keyPairText(en, plain, pair)).toContain(
      "🔐 PRIVATE key — shown only once, keep it OFF THE NAS:",
    );
    expect(keyPairText(en, plain, pair)).toContain("      AGE-SECRET-KEY-1ABC\n");
  });

  it("gli esiti contano con i plurali della lingua, e allineano le etichette", () => {
    expect(
      backupDoneText(it_, plain, { byteSize: 20480, fileCount: 12, path: "/b/x.tar.age" }),
    ).toBe(
      [
        "● Backup creato con successo!",
        "   ├── Archivio:   /b/x.tar.age",
        "   ├── File:       12 file inclusi",
        "   └── Dimensione: 20.480 byte cifrati al sicuro",
        "",
        "",
      ].join("\n"),
    );
    expect(backupDoneText(en, plain, { byteSize: 2048, fileCount: 1, path: "/b/x" })).toContain(
      "1 file included",
    );
    expect(restoreDoneText(en, plain, { destination: "/restore", fileCount: 3 })).toContain(
      "   └── Files extracted: 3 files restored",
    );
  });

  it("gli errori che ESTIA riconosce si dicono nella lingua di chi legge", () => {
    expect(errorText(en, plain, new BackupKeyError("unreadable", "Non riesco…"))).toBe(
      "❌ ERROR: Cannot open this backup: wrong key, or damaged archive.\n",
    );
    expect(errorText(it_, plain, new BackupKeyError("unreadable", "Non riesco…"))).toBe(
      "❌ ERRORE: Non riesco ad aprire questo backup: chiave sbagliata, o archivio danneggiato.\n",
    );
    expect(errorText(en, plain, new RestoreDestinationOccupiedError("/data"))).toContain(
      "There is already an instance in /data",
    );
    expect(errorText(en, plain, new UnsafeArchiveEntryError("../etc/passwd"))).toContain(
      "../etc/passwd",
    );
    expect(
      errorText(
        en,
        plain,
        new CliProblem("server.backup_cli.error.unknown_command", { command: "x" }),
      ),
    ).toBe("❌ ERROR: Unknown command: x\n");
    // Un errore del sistema esce com'è, e uno che non è nemmeno un Error ha una frase.
    expect(errorText(en, plain, new Error("ENOENT: no such file"))).toContain("ENOENT");
    expect(errorText(en, plain, 42)).toContain("Unexpected error.");
  });
});
