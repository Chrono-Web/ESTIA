import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { catalogo, LINGUA_DI_RIFERIMENTO, lingue } from "./index.js";

// The checks on the table itself (ADR 0046 §7): what a translator can get
// wrong without writing any code.

const cartella = fileURLToPath(new URL("./frasi/", import.meta.url));
const file = readdirSync(cartella).filter((nome) => nome.endsWith(".json"));
const riferimento = JSON.parse(
  readFileSync(`${cartella}${LINGUA_DI_RIFERIMENTO}.json`, "utf8"),
) as Record<string, string>;

function segnaposti(frase: string): string[] {
  return [...frase.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
}

describe("the phrase table", () => {
  it("registers every language file", () => {
    const registrate = lingue().map((l) => `${l.codice}.json`);
    expect(registrate.sort()).toEqual([...file].sort());
  });

  it("names each file with a valid language code", () => {
    for (const nome of file) {
      const codice = nome.replace(/\.json$/, "");
      expect(Intl.getCanonicalLocales(codice)).toEqual([codice]);
    }
  });

  it("has English and Italian complete", () => {
    for (const codice of ["en", "it"]) {
      expect(Object.keys(catalogo(codice) ?? {}).sort()).toEqual(Object.keys(riferimento).sort());
    }
  });

  for (const nome of file) {
    const codice = nome.replace(/\.json$/, "");

    describe(nome, () => {
      const frasi = JSON.parse(readFileSync(`${cartella}${nome}`, "utf8")) as Record<
        string,
        unknown
      >;

      it("names its own language", () => {
        expect(typeof frasi["lingua.nome"]).toBe("string");
      });

      it("has no key that English does not have", () => {
        const orfane = Object.keys(frasi).filter((k) => !Object.hasOwn(riferimento, k));
        expect(orfane, `${codice}: keys renamed or removed in English`).toEqual([]);
      });

      it("has only non-empty phrases with the same placeholders as English", () => {
        for (const [chiave, frase] of Object.entries(frasi)) {
          expect(typeof frase === "string" && frase.trim() !== "", `${codice}: ${chiave}`).toBe(
            true,
          );
          const inglese = riferimento[chiave];
          if (typeof frase === "string" && inglese !== undefined) {
            expect(segnaposti(frase), `${codice}: ${chiave}`).toEqual(segnaposti(inglese));
          }
        }
      });
    });
  }
});
