/**
 * Le parole con cui ESTIA racconta le chiavi.
 *
 * Sono la parte che nessun typecheck vede e che sbaglia soltanto addosso a una
 * persona — e qui una bugia costa la cronologia: «Esci da questo dispositivo»
 * cancellava le chiavi senza dirlo.
 */
import { describe, expect, it } from "vitest";

import {
  avvisoDiUscita,
  COME_FUNZIONANO,
  raccontoDi,
  statoChiaviDi,
  type StatoChiavi,
} from "./chiavi-stato.js";

const TUTTI: StatoChiavi[] = [
  { copiaDel: "3 marzo 2026", kind: "con-copia" },
  { kind: "senza-copia" },
  { kind: "assenti" },
];

describe("in che stato sono le chiavi", () => {
  it("distingue i tre casi", () => {
    expect(statoChiaviDi({ copiaDel: "ieri", haChiavi: true })).toEqual({
      copiaDel: "ieri",
      kind: "con-copia",
    });
    expect(statoChiaviDi({ haChiavi: true })).toEqual({ kind: "senza-copia" });
    expect(statoChiaviDi({ haChiavi: false })).toEqual({ kind: "assenti" });
  });

  it("senza chiavi è un errore, non una nota a margine", () => {
    // È il caso che rende una persona irraggiungibile senza che se ne accorga.
    expect(raccontoDi({ kind: "assenti" }).tono).toBe("error");
  });

  it("senza chiavi dice la metà che non si vede: nessuno può scriverti", () => {
    expect(raccontoDi({ kind: "assenti" }).testo).toContain("nessuno può scriverti");
  });

  it("con le chiavi e senza copia avverte che si perdono, e dice come rimediare", () => {
    const racconto = raccontoDi({ kind: "senza-copia" });

    expect(racconto.testo).toContain("non si riapriranno più");
    expect(racconto.cosaFare).toBeDefined();
  });

  it("quando è tutto a posto non inventa un compito da fare", () => {
    // Euristica 8: una schermata che allarma sempre non allarma più.
    expect(raccontoDi({ copiaDel: "ieri", kind: "con-copia" }).cosaFare).toBeUndefined();
  });
});

describe("uscire", () => {
  it("avverte solo quando c'è davvero qualcosa da perdere", () => {
    expect(avvisoDiUscita({ kind: "senza-copia" })).toBeDefined();
    expect(avvisoDiUscita({ copiaDel: "ieri", kind: "con-copia" })).toBeUndefined();
    // Senza chiavi non c'è niente da cancellare: avvisare sarebbe rumore.
    expect(avvisoDiUscita({ kind: "assenti" })).toBeUndefined();
  });

  it("dice che non si torna indietro nemmeno rientrando", () => {
    // È la cosa che una persona assume: «rientro e le ritrovo». No.
    expect(avvisoDiUscita({ kind: "senza-copia" })).toContain("rientrando");
  });
});

describe("come si spiega il meccanismo", () => {
  it("dice dove vivono le chiavi, che è la frase da cui discende tutto", () => {
    expect(COME_FUNZIONANO).toContain("questo browser");
    expect(COME_FUNZIONANO).toContain("un browser nuovo");
  });

  it("non usa le parole del protocollo, in nessuno dei tre stati", () => {
    // Euristica 2. «Backup delle chat» in particolare era una bugia: la copia
    // contiene le chiavi, e le conversazioni restano sull'istanza.
    const tutto = [COME_FUNZIONANO, ...TUTTI.flatMap((s) => Object.values(raccontoDi(s)))].join(
      " ",
    );

    for (const parola of ["E2E", "WebCrypto", "KeyPackage", "cifrat", "decifrat", "IndexedDB"]) {
      expect(tutto).not.toContain(parola);
    }
  });

  it("ogni stato ha un titolo e una spiegazione, mai un titolo e basta", () => {
    for (const stato of TUTTI) {
      const racconto = raccontoDi(stato);
      expect(racconto.titolo.length).toBeGreaterThan(0);
      expect(racconto.testo.length).toBeGreaterThan(0);
    }
  });
});
