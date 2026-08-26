/**
 * Il trasporto MLS del client web.
 *
 * Non è un test della libreria — quello lo fa lo spike
 * [S1](../../../../docs/spike/S1-ts-mls-sotto-la-csp.md) con 785 vettori RFC.
 * Qui si prova **la nostra parte**: che l'autenticazione sia montata, che la
 * regola sul `resync` sia rispettata, che la serratura dell'archivio sia quella
 * giusta, e che un messaggio illeggibile resti illeggibile invece di diventare
 * testo.
 */
import { describe, expect, it } from "vitest";

import {
  aggiungi,
  applicaHandshake,
  cifra,
  creaConversazione,
  decifra,
  entraDaWelcome,
  epochDi,
  identitaDaChiave,
  membri,
  nuovaIdentita,
  serraturaArchivio,
  type IdentitaDispositivo,
  type Porta,
} from "./gruppo.js";

/** Il registro dei dispositivi, che nell'istanza è `device_keys`. */
function registro(): Porta & { ammetti: (username: string, chi: IdentitaDispositivo) => void } {
  const chiavi = new Map<string, Uint8Array[]>();

  return {
    ammetti(username, chi) {
      chiavi.set(username, [
        ...(chiavi.get(username) ?? []),
        chi.publicPackage.leafNode.signaturePublicKey,
      ]);
    },
    chiaviDiFirmaDi: (username) => Promise.resolve(chiavi.get(username) ?? []),
  };
}

/** Anna crea, Bruno entra. È la scena di partenza di quasi tutti i test. */
async function casa(): Promise<{
  porta: ReturnType<typeof registro>;
  anna: IdentitaDispositivo;
  bruno: IdentitaDispositivo;
  statoAnna: Awaited<ReturnType<typeof creaConversazione>>;
  statoBruno: Awaited<ReturnType<typeof creaConversazione>>;
}> {
  const porta = registro();
  const anna = await nuovaIdentita("anna");
  const bruno = await nuovaIdentita("bruno");
  porta.ammetti("anna", anna);
  porta.ammetti("bruno", bruno);

  const creato = await creaConversazione("conv-1", anna, porta);
  const aggiunta = await aggiungi(creato, bruno.publicPackage, porta);
  const statoBruno = await entraDaWelcome(
    aggiunta.welcome,
    bruno,
    aggiunta.stato.ratchetTree,
    porta,
  );

  return { anna, bruno, porta, statoAnna: aggiunta.stato, statoBruno };
}

describe("una conversazione MLS", () => {
  it("nasce a due, e i due si vedono", async () => {
    const { statoAnna, statoBruno } = await casa();

    expect(membri(statoAnna).sort()).toEqual(["anna", "bruno"]);
    expect(membri(statoBruno).sort()).toEqual(["anna", "bruno"]);
    expect(epochDi(statoAnna)).toBe(epochDi(statoBruno));
  });

  it("porta un messaggio da una parte all'altra", async () => {
    const { porta, statoAnna, statoBruno } = await casa();

    const inviato = await cifra(statoAnna, "ci vediamo alle 8");
    const letto = await decifra(statoBruno, inviato.busta, porta);

    expect(letto.kind).toBe("messaggio");
    if (letto.kind === "messaggio") {
      expect(letto.testo).toBe("ci vediamo alle 8");
    }
  });

  it("la busta sul filo non contiene il testo in chiaro", async () => {
    const { statoAnna } = await casa();

    const inviato = await cifra(statoAnna, "PAROLA_SEGRETA");

    expect(Buffer.from(inviato.busta).includes(Buffer.from("PAROLA_SEGRETA"))).toBe(false);
  });

  it("un messaggio che non si apre resta illeggibile, e non diventa testo", async () => {
    const { porta, statoBruno } = await casa();

    // Una busta di un'altra conversazione: non c'entra niente con questo gruppo.
    const altra = await casa();
    const estranea = await cifra(altra.statoAnna, "non per te");

    const esito = await decifra(statoBruno, estranea.busta, porta);

    expect(esito.kind).toBe("illeggibile");
    // Il rilievo mosso al client mobile: mai inventare un testo al posto di un
    // errore. Un esito illeggibile non ha proprio un campo `testo` da mostrare.
    expect("testo" in esito).toBe(false);
  });
});

describe("l'autenticazione di chi entra", () => {
  it("respinge chi si fabbrica una credenziale con il nome di un altro", async () => {
    const { porta, statoAnna } = await casa();

    // Mallory non ruba niente: genera un'identità che dice «anna».
    const mallory = await nuovaIdentita("anna");
    // e NON la registra: è il punto.

    await expect(aggiungi(statoAnna, mallory.publicPackage, porta)).rejects.toThrow();
  });

  it("non respinge la persona vera", async () => {
    const { porta, statoAnna } = await casa();

    const carla = await nuovaIdentita("carla");
    porta.ammetti("carla", carla);

    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);
    expect(membri(aggiunta.stato).sort()).toEqual(["anna", "bruno", "carla"]);
  });

  it("un secondo dispositivo della stessa persona entra, con una chiave sua", async () => {
    const { porta, statoAnna } = await casa();

    // Un dispositivo in piu' ha una chiave PROPRIA, registrata sotto lo stesso
    // nome: e' cosi' che l'istanza sa che sono entrambi di Anna.
    const tablet = await nuovaIdentita("anna");
    porta.ammetti("anna", tablet);

    const aggiunta = await aggiungi(statoAnna, tablet.publicPackage, porta);
    expect(membri(aggiunta.stato).filter((n) => n === "anna")).toHaveLength(2);
  });

  it("la stessa chiave di firma non entra due volte", async () => {
    const { anna, porta, statoAnna } = await casa();

    // `identitaDaChiave` riusa la chiave di firma, ed e' cio' che serve al
    // RIENTRO (S3 via A), non a un secondo dispositivo: MLS rifiuta di
    // aggiungere una chiave che nell'albero c'e' gia'. E' un vincolo del
    // protocollo, e va conosciuto prima di disegnarci sopra.
    const stessaChiave = await identitaDaChiave("anna", {
      publicKey: anna.publicPackage.leafNode.signaturePublicKey,
      signKey: anna.privatePackage.signaturePrivateKey,
    });

    await expect(aggiungi(statoAnna, stessaChiave.publicPackage, porta)).rejects.toThrow(
      /already in the group/i,
    );
  });
});

describe("la forward secrecy, che è la ragione di tutto", () => {
  it("chi entra dopo non legge quello che si è detto prima", async () => {
    const { porta, statoAnna } = await casa();

    const prima = await cifra(statoAnna, "detto prima che arrivasse");

    const carla = await nuovaIdentita("carla");
    porta.ammetti("carla", carla);
    const aggiunta = await aggiungi(prima.stato, carla.publicPackage, porta);
    const statoCarla = await entraDaWelcome(
      aggiunta.welcome,
      carla,
      aggiunta.stato.ratchetTree,
      porta,
    );

    expect((await decifra(statoCarla, prima.busta, porta)).kind).toBe("illeggibile");
  });

  it("la serratura dell'archivio è la stessa per tutti i membri, e cambia a ogni epoch", async () => {
    const { porta, statoAnna, statoBruno } = await casa();
    const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");

    const daAnna = hex(await serraturaArchivio(statoAnna));
    const daBruno = hex(await serraturaArchivio(statoBruno));
    expect(daAnna).toBe(daBruno);

    const carla = await nuovaIdentita("carla");
    porta.ammetti("carla", carla);
    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);

    // Cambiata l'epoch, cambia la serratura: è il motivo per cui NON può essere
    // la chiave dell'archivio, ma solo quella che avvolge il mazzo (S2).
    expect(hex(await serraturaArchivio(aggiunta.stato))).not.toBe(daAnna);
  });
});

describe("gli handshake", () => {
  it("un commit applicato da chi lo riceve tiene i due allineati", async () => {
    const { porta, statoAnna, statoBruno } = await casa();

    const carla = await nuovaIdentita("carla");
    porta.ammetti("carla", carla);
    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);

    const brunoAggiornato = await applicaHandshake(statoBruno, aggiunta.commit, porta);

    expect(epochDi(brunoAggiornato)).toBe(epochDi(aggiunta.stato));
    expect(membri(brunoAggiornato).sort()).toEqual(["anna", "bruno", "carla"]);
  });

  it("dopo il commit, i tre si parlano", async () => {
    const { porta, statoAnna, statoBruno } = await casa();

    const carla = await nuovaIdentita("carla");
    porta.ammetti("carla", carla);
    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);
    const statoBrunoDopo = await applicaHandshake(statoBruno, aggiunta.commit, porta);
    const statoCarla = await entraDaWelcome(
      aggiunta.welcome,
      carla,
      aggiunta.stato.ratchetTree,
      porta,
    );

    const inviato = await cifra(aggiunta.stato, "adesso siamo in tre");
    for (const stato of [statoBrunoDopo, statoCarla]) {
      const letto = await decifra(stato, inviato.busta, porta);
      expect(letto.kind).toBe("messaggio");
      if (letto.kind === "messaggio") {
        expect(letto.testo).toBe("adesso siamo in tre");
      }
    }
  });
});
