/**
 * La regola dell'euristica 9: la frase dell'istanza si mostra, il testo
 * dell'ambiente no. «Failed to fetch» non è una cosa che si dice a qualcuno.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "./api.js";
import { spiega } from "./errori.js";

describe("spiega", () => {
  it("mostra la frase dell'istanza, che è già scritta per chi legge", () => {
    const causa = new ApiError("invalid_credentials", "Nome utente o password non validi.", 401);

    expect(spiega(causa, "ripiego")).toBe("Nome utente o password non validi.");
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
