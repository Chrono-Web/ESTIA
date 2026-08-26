/**
 * «2 h» invece di una data intera. I confini contano più delle etichette:
 * è lì che una funzione del tempo sbaglia, e nel feed si vede subito.
 */
import { describe, expect, it } from "vitest";

import { quandoBreve } from "./tempo.js";

const ADESSO = new Date("2026-08-26T12:00:00.000Z");
const fa = (ms: number): string => new Date(ADESSO.getTime() - ms).toISOString();

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;

describe("quandoBreve", () => {
  it("sotto il minuto è «adesso»", () => {
    expect(quandoBreve(fa(0), ADESSO)).toBe("adesso");
    expect(quandoBreve(fa(MINUTO - 1), ADESSO)).toBe("adesso");
  });

  it("un orologio leggermente avanti non produce un futuro", () => {
    // Un istante nel futuro dà un trascorso negativo: deve restare «adesso».
    expect(quandoBreve(new Date(ADESSO.getTime() + 3000).toISOString(), ADESSO)).toBe("adesso");
  });

  it("dal minuto all'ora conta i minuti", () => {
    expect(quandoBreve(fa(MINUTO), ADESSO)).toBe("1 min");
    expect(quandoBreve(fa(59 * MINUTO), ADESSO)).toBe("59 min");
  });

  it("dall'ora al giorno conta le ore", () => {
    expect(quandoBreve(fa(ORA), ADESSO)).toBe("1 h");
    expect(quandoBreve(fa(23 * ORA), ADESSO)).toBe("23 h");
  });

  it("il giorno prima si chiama «ieri», non «1 g»", () => {
    expect(quandoBreve(fa(GIORNO), ADESSO)).toBe("ieri");
    expect(quandoBreve(fa(2 * GIORNO), ADESSO)).toBe("2 g");
    expect(quandoBreve(fa(6 * GIORNO), ADESSO)).toBe("6 g");
  });

  it("oltre la settimana torna alla data, perché «37 giorni fa» non è una risposta", () => {
    const detto = quandoBreve(fa(30 * GIORNO), ADESSO);

    expect(detto).not.toMatch(/\b(min|h|g)\b/);
    expect(detto).toMatch(/lug/i);
  });

  it("dentro l'anno corrente non ripete l'anno, fuori sì", () => {
    expect(quandoBreve("2026-01-15T12:00:00.000Z", ADESSO)).not.toContain("2026");
    expect(quandoBreve("2024-01-15T12:00:00.000Z", ADESSO)).toContain("2024");
  });

  it("una data che non è una data non stampa «Invalid Date»", () => {
    expect(quandoBreve("non-una-data", ADESSO)).toBe("");
  });
});
