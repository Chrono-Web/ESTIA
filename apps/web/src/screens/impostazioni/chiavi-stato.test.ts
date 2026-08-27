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
  UN_DISPOSITIVO_ALLA_VOLTA,
  raccontoDi,
  statoChiaviDi,
  type StatoChiavi,
} from "./chiavi-stato.js";

const TUTTI: StatoChiavi[] = [
  { copiaDel: "3 marzo 2026", kind: "con-copia" },
  { kind: "senza-copia" },
  { kind: "assenti" },
  { kind: "in-attesa" },
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

  it("un dispositivo che aspetta un sì è uno stato suo, non «senza chiavi»", () => {
    // Le chiavi ci sono: quello che manca è che qualcuno dica che sei tu. Dirgli
    // «non hai le chiavi» lo manderebbe a rifarle, che non serve a niente.
    expect(statoChiaviDi({ haChiavi: true, inAttesa: true })).toEqual({ kind: "in-attesa" });
  });

  it("chi aspetta viene rassicurato: i messaggi non si perdono", () => {
    // È la paura vera di chi vede «in attesa»: che nel frattempo qualcosa vada
    // perso. Non va perso niente — arriva sull'altro dispositivo.
    const racconto = raccontoDi({ kind: "in-attesa" });

    expect(racconto.testo).toContain("dispositivo che avevi già");
    expect(racconto.tono).not.toBe("error");
  });

  it("chi aspetta sa dove andare a dire di sì", () => {
    expect(raccontoDi({ kind: "in-attesa" }).cosaFare).toContain("Impostazioni → Chat");
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
    // Senza chiavi, o in attesa, non c'è ancora niente da perdere: avvisare
    // sarebbe rumore, e un avviso che compare sempre non avvisa più.
    expect(avvisoDiUscita({ kind: "assenti" })).toBeUndefined();
    expect(avvisoDiUscita({ kind: "in-attesa" })).toBeUndefined();
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

describe("il limite di oggi", () => {
  it("dice che cosa succede entrando da un altro dispositivo", () => {
    // Era la cosa che si scopriva cambiando stanza: il computer resta
    // collegato, sembra a posto, e non riceve più.
    expect(UN_DISPOSITIVO_ALLA_VOLTA).toContain("un dispositivo alla volta");
    expect(UN_DISPOSITIVO_ALLA_VOLTA).toContain("smetti di riceverli");
  });

  it("non promette una data, e non nasconde che è un limite", () => {
    expect(UN_DISPOSITIVO_ALLA_VOLTA).not.toMatch(/presto|prossimam|a breve/i);
  });
});
