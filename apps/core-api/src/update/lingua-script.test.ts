import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The language of `install.sh` and `bin/estia` (ADR 0044 §3, §4): which one
 * they choose, how `t` fills a sentence, and what reaches the container.
 */

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const INSTALL_SH = path.join(REPO, "install.sh");
const CLI = path.join(REPO, "bin/estia");

/**
 * The environment of the machine running the tests, without what chooses a
 * language: each test says which one it wants. `ESTIA_CONTAINER` names a
 * container nobody has, so `bin/estia` never asks a real instance its language.
 */
function ambiente(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env };

  for (const nome of ["ESTIA_LANG", "LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"]) {
    delete base[nome];
  }

  return { ...base, ESTIA_CONTAINER: "estia-test-inesistente", NO_COLOR: "1", ...env };
}

function sh(args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("sh", args, { encoding: "utf8", env: ambiente(env) });
}

/** The stderr of a command that must fail. */
function errore(args: string[], env: NodeJS.ProcessEnv = {}): string {
  try {
    sh(args, env);
  } catch (caught) {
    return String((caught as { stderr?: string }).stderr);
  }

  throw new Error("doveva fallire");
}

/**
 * Runs a POSIX snippet after sourcing `install.sh` as a library: the language
 * helpers and `t`, without Docker.
 */
function conLibreria(snippet: string, env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("sh", ["-c", `ESTIA_INSTALL_LIB=1 . "$1"; ${snippet}`, "sh", INSTALL_SH], {
    encoding: "utf8",
    env: ambiente(env),
  });
}

/**
 * A `docker` that answers like a machine with an instance on it, and writes
 * every call to a log. `exec … /api/v1/instance` answers `FAKE_INSTANCE_LANG`,
 * `inspect … .Config.Env` answers `FAKE_ENV`.
 */
function dockerFinto(): { path: string; log: string } {
  const root = mkdtempSync(path.join(tmpdir(), "estia-docker-"));
  const bin = path.join(root, "bin");
  const log = path.join(root, "docker.log");

  mkdirSync(bin);
  writeFileSync(log, "");
  writeFileSync(
    path.join(bin, "docker"),
    [
      "#!/bin/sh",
      `printf 'docker %s\\n' "$*" >> '${log}'`,
      'case "$1" in',
      'container) [ -n "${FAKE_EXISTS:-}" ] || exit 1; case "$*" in *--format*) echo estia-data ;; esac ;;',
      'inspect) case "$3" in',
      "  *Config.Env*) printf 'PATH=/usr/bin\\n%s\\n' \"${FAKE_ENV:-}\" ;;",
      "  *State.Running*) echo true ;;",
      "  *Ports*) echo 3000 ;;",
      "  *'\"/data\"'*) echo estia-data ;;",
      "  esac ;;",
      'exec) case "$*" in *api/v1/instance*) echo "${FAKE_INSTANCE_LANG:-}" ;; esac ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(path.join(bin, "docker"), 0o755);

  return { log, path: `${bin}:${process.env.PATH ?? ""}` };
}

describe("install.sh — quale lingua parla", () => {
  it.each([
    [{ ESTIA_LANG: "en" }, "en"],
    [{ ESTIA_LANG: "it" }, "it"],
    [{ LANG: "it_IT.UTF-8" }, "it"],
    [{ LANG: "en_US.UTF-8" }, "en"],
    [{ ESTIA_LANG: "en-GB" }, "en"],
    // C e POSIX non nominano nessuna lingua: si va avanti, fino all'inglese.
    [{ LANG: "C" }, "en"],
    [{ LC_ALL: "C.UTF-8", LANG: "it_IT.UTF-8" }, "it"],
    [{}, "en"],
    // Una lingua che ESTIA non ha non ferma la scelta: si passa alla successiva.
    [{ ESTIA_LANG: "de", LANG: "it_IT.UTF-8" }, "it"],
    [{ ESTIA_LANG: "en", LANG: "it_IT.UTF-8" }, "en"],
    [{ LC_MESSAGES: "it_IT.UTF-8", LANG: "en_US.UTF-8" }, "it"],
    [{ LC_ALL: "en_US.UTF-8", LC_MESSAGES: "it_IT.UTF-8" }, "en"],
  ])("con %o sceglie %s", (env, lingua) => {
    expect(conLibreria('printf "%s" "$LINGUA"', env)).toBe(lingua);
  });
});

describe("install.sh — t, la funzione che scrive le frasi", () => {
  it("riempie i segnaposto con valori che contengono / & \\ e apici, senza toccarli", () => {
    const valore = `a/b&c\\d'e"f`;
    const snippet = 't installer.done.update_volume volume "$VALORE"';

    expect(conLibreria(snippet, { ESTIA_LANG: "en", VALORE: valore })).toBe(
      `The data lives on the volume "${valore}" and stays where it is.`,
    );
    expect(conLibreria(snippet, { LANG: "it_IT.UTF-8", VALORE: valore })).toBe(
      `I dati stanno sul volume «${valore}» e restano dove sono.`,
    );
  });

  it("riempie ogni occorrenza di un segnaposto", () => {
    expect(conLibreria('t installer.existing.no_volume name "x&y"', { ESTIA_LANG: "it" })).toBe(
      "C'e' gia' un container «x&y» che tiene i dati dentro di se', senza volume. Ricrearlo li cancellerebbe. Fermati: 'docker cp x&y:/data ./estia-data-salvata' li porta fuori, e da li' si ripartono.",
    );
  });

  it("mostra la chiave quando nessuna lingua della catena ha la frase", () => {
    expect(conLibreria("t installer.non.esiste", { ESTIA_LANG: "en" })).toBe(
      "installer.non.esiste",
    );
  });

  it("annuncia una lingua incompleta nella sua lingua, con la percentuale (ADR 0044 §4)", () => {
    expect(
      conLibreria("estia_completezza() { printf 42; }; avvisa_se_incompleta", { ESTIA_LANG: "en" }),
    ).toBe("In this version, English is only 42% translated.\n\n");
    expect(
      conLibreria("estia_completezza() { printf 42; }; avvisa_se_incompleta", { ESTIA_LANG: "it" }),
    ).toBe("In questa versione l'italiano è tradotto solo al 42%.\n\n");
    // Oggi entrambe sono complete: nessun avviso.
    expect(conLibreria("avvisa_se_incompleta", { ESTIA_LANG: "en" })).toBe("");
  });

  it("allarga la cornice per un titolo lungo, e i tre bordi restano allineati", () => {
    const titolo = "A title much longer than the sixty-three columns an Italian title fits in";
    const righe = conLibreria(`cornice "🏡" "${titolo}"`).split("\n").slice(1, 4);
    // L'icona è un carattere solo, ma occupa due colonne.
    const colonne = righe.map((riga) => [...riga].length + (riga.includes("🏡") ? 1 : 0));

    expect(righe[1]).toContain(titolo);
    expect(colonne[0]).toBeGreaterThan(70);
    expect(new Set(colonne).size).toBe(1);
  });
});

describe("install.sh — un'installazione intera, con un docker finto", () => {
  function installa(lingua: string): { out: string; log: string } {
    const docker = dockerFinto();
    const dest = mkdtempSync(path.join(tmpdir(), "estia-cli-"));
    const out = sh([INSTALL_SH], {
      ESTIA_CLI_BINDIR: path.join(dest, "bin"),
      ESTIA_CLI_SRC: CLI,
      ESTIA_CONTAINER: "estia",
      ESTIA_LANG: lingua,
      PATH: docker.path,
    });

    return { log: readFileSync(docker.log, "utf8"), out };
  }

  it("in inglese dalla prima riga, e passa la lingua al container", () => {
    const { log, out } = installa("en");

    expect(out.split("\n")[0]).toBe("→ Downloading the image…");
    expect(out).toContain("║  🏡 ESTIA is up");
    expect(out).toContain("Run this same command again, or estia update.");
    expect(out).not.toMatch(/Scarico|in piedi|esecuzione/);
    expect(log).toMatch(/docker run -d .*--env ESTIA_LANG=en /);
  });

  it("in italiano con le frasi di sempre, e la stessa lingua al container", () => {
    const { log, out } = installa("it");

    expect(out.split("\n")[0]).toBe("→ Scarico l'immagine…");
    expect(out).toContain("║  🏡 ESTIA e' in piedi                                              ║");
    expect(out).toContain("   ├── Container:    estia (● in esecuzione)");
    expect(log).toMatch(/docker run -d .*--env ESTIA_LANG=it /);
  });
});

describe("bin/estia — quale lingua parla", () => {
  it("la lingua dell'istanza viene prima di quella del sistema, ma dopo ESTIA_LANG", () => {
    const docker = dockerFinto();
    const env = { ESTIA_CONTAINER: "estia", PATH: docker.path };

    expect(
      errore([CLI, "xyzzy"], { ...env, FAKE_INSTANCE_LANG: "it", LANG: "en_US.UTF-8" }),
    ).toMatch(/Comando sconosciuto/);
    expect(errore([CLI, "xyzzy"], { ...env, FAKE_INSTANCE_LANG: "it", ESTIA_LANG: "en" })).toMatch(
      /Unknown command/,
    );
    // Un'istanza non ancora configurata non ha una lingua: decide il sistema.
    expect(errore([CLI, "xyzzy"], { ...env, FAKE_INSTANCE_LANG: "", LANG: "it_IT.UTF-8" })).toMatch(
      /Comando sconosciuto/,
    );
    expect(errore([CLI, "xyzzy"], { LANG: "C" })).toMatch(/Unknown command/);
  });

  it("ripete un valore con / & e apici così com'è", () => {
    const comando = "a/b&c'd\\e";

    expect(errore([CLI, comando], { ESTIA_LANG: "en" })).toContain(
      `ERROR Unknown command: "${comando}". Type 'estia help' for the list.`,
    );
  });

  it("in inglese mostra i nomi inglesi dei comandi, che esistono tutti", () => {
    const out = sh([CLI, "help"], { ESTIA_LANG: "en" });

    expect(out).toContain("AVAILABLE COMMANDS");
    expect(out).toMatch(/estia restore +Restore from an encrypted backup/);
    expect(out).not.toMatch(/ripristino|aggiorna|riavvia/);
  });

  it("aggiorna tiene la lingua con cui il container era stato creato", () => {
    const docker = dockerFinto();

    sh([CLI, "aggiorna"], {
      ESTIA_CONTAINER: "estia",
      ESTIA_LANG: "en",
      FAKE_ENV: "ESTIA_LANG=it",
      FAKE_EXISTS: "1",
      PATH: docker.path,
    });

    expect(readFileSync(docker.log, "utf8")).toMatch(
      /docker run -d .*--env ESTIA_DATA_DIR=\/data --env ESTIA_HOST=0\.0\.0\.0 --env ESTIA_LANG=it /,
    );
  });

  it("aggiorna un container di prima di ESTIA_LANG con la lingua in cui sta parlando", () => {
    const docker = dockerFinto();

    sh([CLI, "aggiorna"], {
      ESTIA_CONTAINER: "estia",
      ESTIA_LANG: "en",
      FAKE_EXISTS: "1",
      PATH: docker.path,
    });

    expect(readFileSync(docker.log, "utf8")).toMatch(/docker run -d .*--env ESTIA_LANG=en /);
  });
});
