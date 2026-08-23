import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const INSTALL_SH = path.join(REPO, "install.sh");
const CLI = path.join(REPO, "bin/estia");

function sh(args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("sh", args, {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", ...env },
  });
}

describe("install.sh — comando estia sull'host", () => {
  it("è uno script POSIX valido", () => {
    execFileSync("sh", ["-n", INSTALL_SH]);
    execFileSync("sh", ["-n", CLI]);
  });

  it("non si limita più a copiare solo se /usr/local/bin è scrivibile", () => {
    const testo = readFileSync(INSTALL_SH, "utf8");
    expect(testo).toContain("/dev/tty");
    expect(testo).toContain("sudo");
    expect(testo).toContain("$HOME/.local/bin");
    expect(testo).toContain("ESTIA_SOLO_CLI");
    expect(testo).not.toMatch(/if \[ -w \/usr\/local\/bin \]; then\n\tcurl /);
  });

  it("installa la CLI in una cartella indicata, senza sudo e senza Docker", () => {
    const root = mkdtempSync(path.join(tmpdir(), "estia-cli-"));
    const dest = path.join(root, "bin");
    const src = path.join(root, "estia-src");
    writeFileSync(src, "#!/bin/sh\necho ok\n");
    chmodSync(src, 0o755);

    const out = sh([INSTALL_SH], {
      ESTIA_SOLO_CLI: "1",
      ESTIA_CLI_SRC: src,
      ESTIA_CLI_BINDIR: dest,
    });

    expect(out).toContain(path.join(dest, "estia"));
    const installato = readFileSync(path.join(dest, "estia"), "utf8");
    expect(installato).toContain("echo ok");
  });

  it("usa il bin/estia accanto allo script quando si lancia da un clone", () => {
    const root = mkdtempSync(path.join(tmpdir(), "estia-clone-"));
    const dest = path.join(root, "out");
    mkdirSync(dest);
    const cloneInstall = path.join(root, "install.sh");
    const cloneCliDir = path.join(root, "bin");
    mkdirSync(cloneCliDir);
    writeFileSync(cloneInstall, readFileSync(INSTALL_SH));
    writeFileSync(path.join(cloneCliDir, "estia"), "#!/bin/sh\necho dal-clone\n");
    chmodSync(cloneInstall, 0o755);
    chmodSync(path.join(cloneCliDir, "estia"), 0o755);

    sh([cloneInstall], {
      ESTIA_SOLO_CLI: "1",
      ESTIA_CLI_BINDIR: dest,
    });

    expect(readFileSync(path.join(dest, "estia"), "utf8")).toContain("dal-clone");
  });
});

describe("bin/estia — aspetto dei comandi", () => {
  it("aiuto usa la stessa cornice di info e elenca i comandi", () => {
    const out = sh([CLI, "aiuto"]);
    expect(out).toContain("ESTIA");
    expect(out).toContain("estia info");
    expect(out).toContain("estia ripristino-backup");
    expect(out).toContain("╔");
  });

  it("un comando sconosciuto esce con un errore in italiano", () => {
    try {
      sh([CLI, "xyzzy"]);
      throw new Error("doveva fallire");
    } catch (errore) {
      const e = errore as { message: string; stderr?: string };
      expect(`${e.message}\n${e.stderr ?? ""}`).toMatch(/sconosciuto/);
    }
  });
});
