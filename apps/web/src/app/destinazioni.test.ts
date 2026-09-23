/**
 * Le voci di navigazione parlano la lingua di chi guarda, e la sidebar le
 * ritrova lo stesso.
 *
 * Fino all'internazionalizzazione (ADR 0044) la sidebar cercava le proprie voci
 * **per etichetta** — `d.etichetta === "Cerca"` — e in inglese non ne avrebbe
 * trovata nessuna: lanciava. Ora le cerca per `id`, che non cambia con la
 * lingua; questo test tiene ferme le due metà di quel patto.
 */
import { describe, expect, it } from "vitest";

import { impostaLingua } from "../i18n/index.js";
import { destinazioni, destinazioniPrimarie } from "./destinazioni.js";

describe("destinazioni", () => {
  it("in italiano dice le parole che le persone conoscono", () => {
    expect(destinazioni("marco").map((d) => d.etichetta)).toEqual([
      "Home",
      "Cerca",
      "Messaggi",
      "Crea",
      "Notifiche",
      "Profilo",
      "Impostazioni",
    ]);
  });

  it("ogni voce ha un id suo", () => {
    const ids = destinazioni("marco").map((d) => d.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cambiando lingua cambiano le etichette, non gli id", async () => {
    const italiano = destinazioni("marco");

    await impostaLingua("en");

    try {
      const inglese = destinazioni("marco");

      expect(inglese.map((d) => d.id)).toEqual(italiano.map((d) => d.id));
      expect(inglese.map((d) => d.to)).toEqual(italiano.map((d) => d.to));
      expect(inglese.find((d) => d.id === "cerca")?.etichetta).toBe("Search");
      expect(destinazioniPrimarie("marco").map((d) => d.etichetta)).toEqual([
        "Home",
        "Messages",
        "Create",
        "Activity",
        "Profile",
      ]);
    } finally {
      await impostaLingua("it");
    }
  });
});
