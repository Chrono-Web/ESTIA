import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { catalogo } from "@estia/lingue";
import { describe, expect, it } from "vitest";

// ADR 0046 §3: the instance sends a code, the client shows the phrase. A code
// without a phrase would reach a person as the instance's English fallback, so
// every code this instance can send must be in the table, in English and in
// Italian. Collected from the source, because the codes are string literals.

const radice = fileURLToPath(new URL(".", import.meta.url));

function sorgenti(cartella: string): string[] {
  return readdirSync(cartella, { withFileTypes: true }).flatMap((voce) => {
    const percorso = join(cartella, voce.name);
    if (voce.isDirectory()) {
      return sorgenti(percorso);
    }
    return voce.name.endsWith(".ts") && !voce.name.endsWith(".test.ts") ? [percorso] : [];
  });
}

function codici(): Set<string> {
  const trovati = new Set<string>();
  for (const file of sorgenti(radice)) {
    const testo = readFileSync(file, "utf8");
    for (const m of testo.matchAll(/new DomainError\(\s*"([a-z_]+)"/g)) {
      trovati.add(m[1] ?? "");
    }
    // Replies built by hand, outside DomainError.
    for (const m of testo.matchAll(/send\(\{\s*code:\s*"([a-z_]+)"/g)) {
      trovati.add(m[1] ?? "");
    }
  }
  return trovati;
}

describe("error codes", () => {
  const tutti = codici();

  it("are found in the source", () => {
    // A guard on the scan itself: if the pattern stops matching, the check
    // below would pass on an empty set.
    expect(tutti.size).toBeGreaterThan(50);
    expect(tutti).toContain("internal_error");
  });

  for (const lingua of ["en", "it"]) {
    it(`each have a phrase in ${lingua}`, () => {
      const frasi = catalogo(lingua) ?? {};
      const mancanti = [...tutti].filter((code) => !Object.hasOwn(frasi, `errori.${code}`));
      expect(mancanti).toEqual([]);
    });
  }
});
