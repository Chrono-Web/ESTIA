/**
 * La regola dell'euristica 9: la frase per il codice dell'istanza si mostra,
 * il testo dell'ambiente no. «Failed to fetch» non è una cosa che si dice a
 * qualcuno.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "./api.js";
import { spiega } from "./errori.js";
import { impostaLingua } from "./i18n/index.js";

describe("spiega", () => {
  it("mostra il messaggio dell'istanza per un codice che il catalogo non conosce", () => {
    const causa = new ApiError("codice_nuovo", "Una frase che arriva dall'istanza.", 409);

    expect(spiega(causa, "ripiego")).toBe("Una frase che arriva dall'istanza.");
  });

  it("per un codice noto usa la frase del catalogo, nella lingua di chi legge", async () => {
    const causa = new ApiError("unknown_language", 'There is no "tlh" translation.', 400, {
      language: "tlh",
    });

    expect(spiega(causa, "ripiego")).toContain("tlh");
    expect(spiega(causa, "ripiego")).not.toBe(causa.message);

    await impostaLingua("en");

    try {
      expect(spiega(causa, "ripiego")).toContain("tlh");
    } finally {
      await impostaLingua("it");
    }
  });

  it("non mostra il testo della validazione degli schemi, che è per chi programma", () => {
    const causa = new ApiError(
      "FST_ERR_VALIDATION",
      "body/name must NOT have fewer than 1 characters",
      400,
    );

    expect(spiega(causa, "Il nome non può essere vuoto.")).toBe("Il nome non può essere vuoto.");
  });

  it("non mostra mai il testo di fetch quando la rete non risponde", () => {
    const detto = spiega(new TypeError("Failed to fetch"), "ripiego");

    expect(detto).not.toContain("Failed to fetch");
    expect(detto).toContain("Non riesco a raggiungere l'istanza");
  });

  it("dice anche la prossima mossa, non solo la causa", () => {
    expect(spiega(new TypeError("Load failed"), "ripiego")).toContain("riprova");
  });

  it("usa il ripiego di chi ha chiesto l'azione quando la causa è muta", () => {
    expect(spiega(new Error("boom"), "Non sono riuscito a salvare il profilo.")).toBe(
      "Non sono riuscito a salvare il profilo.",
    );
    expect(spiega(undefined, "ripiego")).toBe("ripiego");
    expect(spiega("una stringa qualsiasi", "ripiego")).toBe("ripiego");
  });
});
