/**
 * Il codice da confrontare, provato per quello che deve garantire.
 *
 * Non è la sua entropia a contare — non è un segreto — ma due proprietà che
 * sono l'unica ragione per cui il confronto vuol dire qualcosa: **la stessa
 * chiave dà sempre lo stesso codice**, altrimenti chi confronta vede due numeri
 * diversi per lo stesso dispositivo e impara a ignorarli; e **una chiave
 * diversa dà un codice diverso**, altrimenti una chiave sostituita passerebbe.
 */
import { describe, expect, it } from "vitest";

import { codiceDi } from "./codice-dispositivo.js";

describe("il codice di un dispositivo", () => {
  it("è sempre lo stesso per la stessa chiave", () => {
    // Le due metà del confronto lo calcolano su due macchine diverse: se non
    // fosse stabile, non ci sarebbe niente da confrontare.
    expect(codiceDi("CHIAVE_DI_ANNA")).toBe(codiceDi("CHIAVE_DI_ANNA"));
  });

  it("cambia se la chiave cambia, anche di un carattere", () => {
    // È il caso che conta: un'istanza che sostituisce la chiave deve produrre
    // un codice che non coincide, o la sostituzione passa inosservata.
    expect(codiceDi("CHIAVE_DI_ANNA")).not.toBe(codiceDi("CHIAVE_DI_ANNB"));
  });

  it("si legge a voce: otto cifre in due gruppi", () => {
    expect(codiceDi("una chiave qualunque")).toMatch(/^\d{4} \d{4}$/);
  });

  it("non perde gli zeri davanti", () => {
    // Un codice che a volte è di sette cifre è un codice che chi confronta
    // legge male. Su qualche migliaio di chiavi qualcuno inizia per zero.
    for (let i = 0; i < 5000; i++) {
      expect(codiceDi(`chiave-${String(i)}`)).toMatch(/^\d{4} \d{4}$/);
    }
  });

  it("non ripete lo stesso codice su chiavi diverse, in pratica", () => {
    // Non è una prova crittografica: è la constatazione che su mille
    // dispositivi due codici uguali non capitano, che è il numero che conta per
    // una casa.
    const visti = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      visti.add(codiceDi(`dispositivo-${String(i)}`));
    }

    expect(visti.size).toBe(1000);
  });
});
