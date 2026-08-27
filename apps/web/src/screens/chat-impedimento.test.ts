/**
 * Le parole che una chat dice quando non si può usare.
 *
 * È il genere di cosa che nessun altro controllo vede: una frase inglese scritta
 * per chi programma passa typecheck, lint e build, e sbaglia soltanto addosso a
 * una persona. È già successo — «The user has no registered active devices.» è
 * quello che ha visto un membro provando a scrivere a un'amica.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "../api.js";
import { impedimentoDi, siPuoScrivere, spiegazioneDi } from "./chat-impedimento.js";

const senzaDispositivo = new ApiError(
  "no_device_available",
  "The user has no registered active devices.",
  404,
);

describe("che cosa impedisce una conversazione", () => {
  it("quando è tutto a posto, non impedisce niente e si scrive", () => {
    const impedimento = impedimentoDi({
      crittografiaDisponibile: true,
      nomeDestinatario: "Lucia",
    });

    expect(impedimento.kind).toBe("nessuno");
    expect(siPuoScrivere(impedimento)).toBe(true);
    expect(spiegazioneDi(impedimento)).toBeUndefined();
  });

  it("riconosce che il destinatario non ha ancora una chiave", () => {
    const impedimento = impedimentoDi({
      crittografiaDisponibile: true,
      erroreChiave: senzaDispositivo,
      nomeDestinatario: "Lucia",
    });

    expect(impedimento).toEqual({ kind: "destinatario-senza-dispositivo", nome: "Lucia" });
    expect(siPuoScrivere(impedimento)).toBe(false);
  });

  it("la connessione non sicura vince sul resto", () => {
    // Blocca anche la lettura, ed è l'unica cosa su cui chi guarda può agire da
    // solo: dirgli dell'altra persona sarebbe mandarlo a risolvere il problema
    // sbagliato.
    const impedimento = impedimentoDi({
      crittografiaDisponibile: false,
      erroreChiave: senzaDispositivo,
      nomeDestinatario: "Lucia",
    });

    expect(impedimento.kind).toBe("connessione-non-sicura");
  });

  it("un errore qualunque non diventa «non ha il dispositivo»", () => {
    // Si guarda il codice, non il testo: indovinare la causa da una frase è il
    // modo per dire una bugia precisa.
    const impedimento = impedimentoDi({
      crittografiaDisponibile: true,
      erroreChiave: new ApiError("forbidden", "Non sei membro di questa conversazione.", 403),
      nomeDestinatario: "Lucia",
    });

    expect(impedimento.kind).toBe("nessuno");
  });
});

describe("le parole che si leggono", () => {
  it("dicono il nome della persona, non un codice", () => {
    const spiegazione = spiegazioneDi({
      kind: "destinatario-senza-dispositivo",
      nome: "Lucia",
    })!;

    expect(spiegazione.titolo).toContain("Lucia");
    expect(spiegazione.segnaposto).toContain("Lucia");
  });

  it("non lasciano mai un vicolo cieco: c'è sempre una prossima mossa", () => {
    // Euristica 3 e 9: causa e prossima mossa, mai un codice grezzo come esito.
    for (const impedimento of [
      { kind: "connessione-non-sicura" } as const,
      { kind: "destinatario-senza-dispositivo", nome: "Lucia" } as const,
    ]) {
      const spiegazione = spiegazioneDi(impedimento)!;
      expect(spiegazione.cosaFare.length).toBeGreaterThan(0);
      expect(spiegazione.testo.length).toBeGreaterThan(0);
    }
  });

  it("dicono a chi entra da una connessione non sicura che nessuno può scrivergli", () => {
    // È la metà che mancava, ed è quella che rende una persona invisibile senza
    // che lo sappia: sa di non poter scrivere, non sa di non poter ricevere.
    const spiegazione = spiegazioneDi({ kind: "connessione-non-sicura" })!;

    expect(spiegazione.testo).toContain("nessuno può scriverti");
  });

  it("non parlano di chiavi pubbliche, dispositivi registrati e altre parole del protocollo", () => {
    // Euristica 2: parole di chi usa l'istanza, non del protocollo.
    const tutte = [
      spiegazioneDi({ kind: "connessione-non-sicura" })!,
      spiegazioneDi({ kind: "destinatario-senza-dispositivo", nome: "Lucia" })!,
    ];

    for (const spiegazione of tutte) {
      const testo = `${spiegazione.titolo} ${spiegazione.testo} ${spiegazione.cosaFare}`;
      for (const parola of ["KeyPackage", "chiave pubblica", "registrat", "WebCrypto", "E2E"]) {
        expect(testo).not.toContain(parola);
      }
    }
  });
});
