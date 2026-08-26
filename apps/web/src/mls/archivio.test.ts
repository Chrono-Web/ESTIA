/**
 * L'archivio lato client: le quattro proprietà che [ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)
 * decide, e che lo spike [S2](../../../../docs/spike/S2-la-chiave-d-archivio.md)
 * aveva verificato in laboratorio. Qui sono provate sul codice che finisce nel
 * prodotto.
 */
import { randomBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  archivia,
  avvolgi,
  catenaNuova,
  catenaRuotata,
  rileggi,
  svolgi,
  type Catena,
} from "./archivio.js";

const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");
const impronta = (c: Catena): string[] => c.map(hex);

describe("il mazzo", () => {
  it("si avvolge e si riapre con la stessa serratura", () => {
    const catena = catenaNuova();
    const serratura = randomBytes(32);

    expect(impronta(svolgi(avvolgi(catena, serratura), serratura))).toEqual(impronta(catena));
  });

  it("non si apre con una serratura diversa: chi non è nel gruppo resta fuori", () => {
    const avvolto = avvolgi(catenaNuova(), randomBytes(32));

    expect(() => svolgi(avvolto, randomBytes(32))).toThrow();
  });

  it("riavvolto sotto una serratura nuova, contiene ancora le stesse chiavi", () => {
    // È il gesto di ogni cambio di epoch: cambia la serratura, non il contenuto.
    const catena = catenaRuotata(catenaNuova());
    const vecchia = randomBytes(32);
    const nuova = randomBytes(32);

    const riavvolto = avvolgi(svolgi(avvolgi(catena, vecchia), vecchia), nuova);

    expect(impronta(svolgi(riavvolto, nuova))).toEqual(impronta(catena));
  });
});

describe("la catena", () => {
  it("nasce con una chiave sola, casuale e non derivata da MLS", () => {
    const a = catenaNuova();
    const b = catenaNuova();

    expect(a).toHaveLength(1);
    // Due conversazioni non condividono la chiave d'archivio.
    expect(hex(a[0]!)).not.toBe(hex(b[0]!));
  });

  it("ruotando conserva le vecchie e ne aggiunge una", () => {
    const prima = catenaNuova();
    const dopo = catenaRuotata(prima);

    expect(dopo).toHaveLength(2);
    expect(hex(dopo[0]!)).toBe(hex(prima[0]!));
  });
});

describe("le voci", () => {
  it("si scrivono con l'ultima chiave, e si rileggono", () => {
    const catena = catenaNuova();
    const voce = archivia(catena, "i preventivi del tetto");

    expect(voce.chiaveN).toBe(1);
    expect(rileggi(catena, voce)).toBe("i preventivi del tetto");
  });

  it("la busta non contiene il testo in chiaro", () => {
    const voce = archivia(catenaNuova(), "PAROLA_SEGRETA");

    expect(Buffer.from(voce.busta, "base64").includes(Buffer.from("PAROLA_SEGRETA"))).toBe(false);
  });

  it("dopo una rotazione si scrive con la chiave nuova", () => {
    const dopo = catenaRuotata(catenaNuova());
    const voce = archivia(dopo, "detto dopo l'uscita");

    expect(voce.chiaveN).toBe(2);
    expect(rileggi(dopo, voce)).toBe("detto dopo l'uscita");
  });

  it("chi ha solo le chiavi vecchie legge il pregresso e non il seguito", () => {
    // È esattamente ciò che ADR 0037 §«Che cosa non copre» punto 2 dichiara.
    const prima = catenaNuova();
    const pregresso = archivia(prima, "prima che uscisse");

    const dopo = catenaRuotata(prima);
    const seguito = archivia(dopo, "dopo che è uscito");

    // Chi è uscito ha `prima`, non `dopo`.
    expect(rileggi(prima, pregresso)).toBe("prima che uscisse");
    expect(rileggi(prima, seguito)).toBeUndefined();

    // Chi è rimasto legge tutto.
    expect(rileggi(dopo, pregresso)).toBe("prima che uscisse");
    expect(rileggi(dopo, seguito)).toBe("dopo che è uscito");
  });

  it("chi entra dopo riceve il mazzo intero e legge anche il pregresso", () => {
    // La scelta del proprietario in ADR 0037 §4, provata.
    const catena = catenaNuova();
    const pregresso = archivia(catena, "detto prima che entrasse");
    const serratura = randomBytes(32);

    // Chi entra apre il mazzo con la serratura dell'epoch in cui è entrato.
    const suaCopia = svolgi(avvolgi(catena, serratura), serratura);

    expect(rileggi(suaCopia, pregresso)).toBe("detto prima che entrasse");
  });

  it("una voce che non si apre torna indefinita, e non diventa testo", () => {
    const catena = catenaNuova();
    const altra = catenaNuova();
    const voce = archivia(altra, "non per te");

    const esito = rileggi(catena, voce);

    // Il rilievo mosso al client mobile: mai una frase inventata al posto di un
    // errore. `undefined` obbliga chi disegna a decidere che cosa mostrare.
    expect(esito).toBeUndefined();
  });

  it("una voce che cita una chiave che non c'è non esplode", () => {
    const catena = catenaNuova();

    expect(rileggi(catena, { busta: "abc", chiaveN: 99 })).toBeUndefined();
    expect(rileggi(catena, { busta: "abc", chiaveN: 0 })).toBeUndefined();
  });
});
