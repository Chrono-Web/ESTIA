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
  puntoDiRientro,
  rientra,
  serraturaArchivio,
  type IdentitaDispositivo,
  type Membro,
  type Porta,
} from "./gruppo.js";

/** La casa di questi test. Ogni credenziale ne porta una (ADR 0042 §0). */
const CASA = "casa-di-prova";

const chi = (username: string, casa: string = CASA): Membro => ({ casa, username });

/**
 * Il registro dei dispositivi, che nell'istanza è `device_keys`.
 *
 * **Uno per casa**, come quello vero: il registro locale sa dei suoi membri, e
 * di un membro di un'altra casa non sa niente. È quello che rende provabile la
 * verifica 4 di ADR 0042 — due `anna` di due case non si confondono.
 */
function registro(): Porta & { ammetti: (membro: Membro, chi: IdentitaDispositivo) => void } {
  const chiavi = new Map<string, Uint8Array[]>();
  const nome = (membro: Membro): string => `${membro.username}@${membro.casa}`;

  return {
    ammetti(membro, identita) {
      chiavi.set(nome(membro), [
        ...(chiavi.get(nome(membro)) ?? []),
        identita.publicPackage.leafNode.signaturePublicKey,
      ]);
    },
    chiaviDiFirmaDi: (membro) => Promise.resolve(chiavi.get(nome(membro)) ?? []),
  };
}

/** I nomi di chi c'è, per i confronti dei test. */
const nomi = (stato: Parameters<typeof membri>[0]): string[] =>
  membri(stato)
    .map((m) => m.username)
    .sort();

/** Anna crea, Bruno entra. È la scena di partenza di quasi tutti i test. */
async function casa(): Promise<{
  porta: ReturnType<typeof registro>;
  anna: IdentitaDispositivo;
  bruno: IdentitaDispositivo;
  statoAnna: Awaited<ReturnType<typeof creaConversazione>>;
  statoBruno: Awaited<ReturnType<typeof creaConversazione>>;
}> {
  const porta = registro();
  const anna = await nuovaIdentita(chi("anna"));
  const bruno = await nuovaIdentita(chi("bruno"));
  porta.ammetti(chi("anna"), anna);
  porta.ammetti(chi("bruno"), bruno);

  const creato = await creaConversazione("conv-1", anna, porta);
  const aggiunta = await aggiungi(creato, bruno.publicPackage, porta);
  const statoBruno = await entraDaWelcome(aggiunta.welcome, bruno, porta);

  return { anna, bruno, porta, statoAnna: aggiunta.stato, statoBruno };
}

describe("una conversazione MLS", () => {
  it("nasce a due, e i due si vedono", async () => {
    const { statoAnna, statoBruno } = await casa();

    expect(nomi(statoAnna)).toEqual(["anna", "bruno"]);
    expect(nomi(statoBruno)).toEqual(["anna", "bruno"]);
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
    const mallory = await nuovaIdentita(chi("anna"));
    // e NON la registra: è il punto.

    await expect(aggiungi(statoAnna, mallory.publicPackage, porta)).rejects.toThrow();
  });

  it("non respinge la persona vera", async () => {
    const { porta, statoAnna } = await casa();

    const carla = await nuovaIdentita(chi("carla"));
    porta.ammetti(chi("carla"), carla);

    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);
    expect(nomi(aggiunta.stato)).toEqual(["anna", "bruno", "carla"]);
  });

  it("un secondo dispositivo della stessa persona entra, con una chiave sua", async () => {
    const { porta, statoAnna } = await casa();

    // Un dispositivo in piu' ha una chiave PROPRIA, registrata sotto lo stesso
    // nome: e' cosi' che l'istanza sa che sono entrambi di Anna.
    const tablet = await nuovaIdentita(chi("anna"));
    porta.ammetti(chi("anna"), tablet);

    const aggiunta = await aggiungi(statoAnna, tablet.publicPackage, porta);
    expect(nomi(aggiunta.stato).filter((n) => n === "anna")).toHaveLength(2);
  });

  it("la stessa chiave di firma non entra due volte", async () => {
    const { anna, porta, statoAnna } = await casa();

    // `identitaDaChiave` riusa la chiave di firma, ed e' cio' che serve al
    // RIENTRO (S3 via A), non a un secondo dispositivo: MLS rifiuta di
    // aggiungere una chiave che nell'albero c'e' gia'. E' un vincolo del
    // protocollo, e va conosciuto prima di disegnarci sopra.
    const stessaChiave = await identitaDaChiave(chi("anna"), {
      publicKey: anna.publicPackage.leafNode.signaturePublicKey,
      signKey: anna.privatePackage.signaturePrivateKey,
    });

    await expect(aggiungi(statoAnna, stessaChiave.publicPackage, porta)).rejects.toThrow(
      /already in the group/i,
    );
  });
});

describe("la casa dentro la credenziale (ADR 0042 §0)", () => {
  it("due persone con lo stesso nome su due case diverse non si confondono", async () => {
    // È la verifica 4 di ADR 0042, e il buco che chiude: `anna` di un'altra
    // casa si registra nel registro della SUA casa, e qui dentro non conta.
    const { porta, statoAnna } = await casa();

    const annaAltrove = await nuovaIdentita(chi("anna", "un'altra-casa"));
    porta.ammetti(chi("anna"), annaAltrove);

    await expect(aggiungi(statoAnna, annaAltrove.publicPackage, porta)).rejects.toThrow();
  });

  it("chi porta la casa giusta entra, e l'elenco dice di quale casa è", async () => {
    const { porta, statoAnna } = await casa();

    const annaAltrove = await nuovaIdentita(chi("anna", "un'altra-casa"));
    porta.ammetti(chi("anna", "un'altra-casa"), annaAltrove);

    const aggiunta = await aggiungi(statoAnna, annaAltrove.publicPackage, porta);
    expect(membri(aggiunta.stato)).toContainEqual({ casa: "un'altra-casa", username: "anna" });
    expect(membri(aggiunta.stato).filter((m) => m.casa === CASA)).toHaveLength(2);
  });

  it("una credenziale senza casa non vale più niente", async () => {
    // Le credenziali di prima di ADR 0042 portavano il solo nome. Nessun albero
    // vero le contiene — è il motivo per cui si cambia adesso — e una che
    // arrivasse ora sarebbe qualcuno che spera che si indovini la casa.
    const { porta, statoAnna } = await casa();
    const senzaCasa = await nuovaIdentita({ casa: "", username: "carla" });

    await expect(aggiungi(statoAnna, senzaCasa.publicPackage, porta)).rejects.toThrow();
  });
});

describe("il registro si chiede una volta per validazione (ADR 0042 §1)", () => {
  /** Un registro che conta le domande, per misurare i giri di rete. */
  function registroCheConta(): ReturnType<typeof registro> & { domande: () => number } {
    const vero = registro();
    let domande = 0;

    return {
      ammetti: vero.ammetti,
      chiaviDiFirmaDi: (membro) => {
        domande += 1;

        return vero.chiaviDiFirmaDi(membro);
      },
      domande: () => domande,
    };
  }

  it("una persona con due dispositivi costa una domanda, non due", async () => {
    // `validateCredential` è chiamata a ogni foglia (S4 §«Limiti»): su un gruppo
    // da cinquanta, una domanda per foglia sarebbero cinquanta giri di rete.
    const porta = registroCheConta();
    const anna = await nuovaIdentita(chi("anna"));
    const tablet = await nuovaIdentita(chi("anna"));
    const bruno = await nuovaIdentita(chi("bruno"));
    porta.ammetti(chi("anna"), anna);
    porta.ammetti(chi("anna"), tablet);
    porta.ammetti(chi("bruno"), bruno);

    const creato = await creaConversazione("conv-1", anna, porta);
    const conTablet = await aggiungi(creato, tablet.publicPackage, porta);
    const conBruno = await aggiungi(conTablet.stato, bruno.publicPackage, porta);

    const prima = porta.domande();
    // Tre foglie, due persone: la validazione dell'albero non può costare più
    // di una domanda per persona.
    await entraDaWelcome(conBruno.welcome, bruno, porta);

    expect(porta.domande() - prima).toBeLessThanOrEqual(2);
  });

  it("l'operazione dopo chiede di nuovo: un registro tenuto è una revoca che non arriva", async () => {
    const porta = registroCheConta();
    const anna = await nuovaIdentita(chi("anna"));
    const bruno = await nuovaIdentita(chi("bruno"));
    const carla = await nuovaIdentita(chi("carla"));
    porta.ammetti(chi("anna"), anna);
    porta.ammetti(chi("bruno"), bruno);
    porta.ammetti(chi("carla"), carla);

    const statoAnna = await creaConversazione("conv-1", anna, porta);
    const conBruno = await aggiungi(statoAnna, bruno.publicPackage, porta);

    const dopoLaPrima = porta.domande();
    // La finestra è l'operazione. Fuori da lì non resta niente da riusare, ed è
    // il vincolo di ADR 0042 §1: la revoca di una chiave deve poter arrivare.
    await aggiungi(conBruno.stato, carla.publicPackage, porta);

    expect(porta.domande()).toBeGreaterThan(dopoLaPrima);
  });
});

describe("la forward secrecy, che è la ragione di tutto", () => {
  it("chi entra dopo non legge quello che si è detto prima", async () => {
    const { porta, statoAnna } = await casa();

    const prima = await cifra(statoAnna, "detto prima che arrivasse");

    const carla = await nuovaIdentita(chi("carla"));
    porta.ammetti(chi("carla"), carla);
    const aggiunta = await aggiungi(prima.stato, carla.publicPackage, porta);
    const statoCarla = await entraDaWelcome(aggiunta.welcome, carla, porta);

    expect((await decifra(statoCarla, prima.busta, porta)).kind).toBe("illeggibile");
  });

  it("la serratura dell'archivio è la stessa per tutti i membri, e cambia a ogni epoch", async () => {
    const { porta, statoAnna, statoBruno } = await casa();
    const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");

    const daAnna = hex(await serraturaArchivio(statoAnna));
    const daBruno = hex(await serraturaArchivio(statoBruno));
    expect(daAnna).toBe(daBruno);

    const carla = await nuovaIdentita(chi("carla"));
    porta.ammetti(chi("carla"), carla);
    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);

    // Cambiata l'epoch, cambia la serratura: è il motivo per cui NON può essere
    // la chiave dell'archivio, ma solo quella che avvolge il mazzo (S2).
    expect(hex(await serraturaArchivio(aggiunta.stato))).not.toBe(daAnna);
  });
});

describe("gli handshake", () => {
  it("un commit applicato da chi lo riceve tiene i due allineati", async () => {
    const { porta, statoAnna, statoBruno } = await casa();

    const carla = await nuovaIdentita(chi("carla"));
    porta.ammetti(chi("carla"), carla);
    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);

    const brunoAggiornato = await applicaHandshake(statoBruno, aggiunta.commit, porta);

    expect(epochDi(brunoAggiornato)).toBe(epochDi(aggiunta.stato));
    expect(nomi(brunoAggiornato)).toEqual(["anna", "bruno", "carla"]);
  });

  it("dopo il commit, i tre si parlano", async () => {
    const { porta, statoAnna, statoBruno } = await casa();

    const carla = await nuovaIdentita(chi("carla"));
    porta.ammetti(chi("carla"), carla);
    const aggiunta = await aggiungi(statoAnna, carla.publicPackage, porta);
    const statoBrunoDopo = await applicaHandshake(statoBruno, aggiunta.commit, porta);
    const statoCarla = await entraDaWelcome(aggiunta.welcome, carla, porta);

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

describe("il rientro di chi ha perso il telefono", () => {
  it("dal punto pubblicato si torna nel gruppo, senza che nessun altro sia online", async () => {
    const { anna, porta, statoBruno } = await casa();

    // Il telefono di Anna è in fondo al mare. Dal backup con passphrase torna la
    // chiave di FIRMA; la foglia è nuova, perché la vecchia è annegata con lui.
    const foglia = await identitaDaChiave(chi("anna"), {
      publicKey: anna.publicPackage.leafNode.signaturePublicKey,
      signKey: anna.privatePackage.signaturePrivateKey,
    });

    const tornata = await rientra(await puntoDiRientro(statoBruno), foglia, porta);

    expect(nomi(tornata.stato)).toEqual(["anna", "bruno"]);
    expect(tornata.epoch).toBe(epochDi(statoBruno) + 1);
  });

  it("con la stessa chiave di firma sostituisce la foglia, non la affianca", async () => {
    // È la differenza fra le due vie di S3, e non è contabile: una foglia in più
    // vuol dire che il telefono perduto è ancora membro, e continua a ricevere.
    const { anna, porta, statoBruno } = await casa();

    const stessaChiave = await identitaDaChiave(chi("anna"), {
      publicKey: anna.publicPackage.leafNode.signaturePublicKey,
      signKey: anna.privatePackage.signaturePrivateKey,
    });
    const chiaveNuova = await nuovaIdentita(chi("anna"));
    porta.ammetti(chi("anna"), chiaveNuova);

    const conStessaChiave = await rientra(await puntoDiRientro(statoBruno), stessaChiave, porta);
    const conChiaveNuova = await rientra(await puntoDiRientro(statoBruno), chiaveNuova, porta);

    expect(membri(conStessaChiave.stato)).toHaveLength(2);
    expect(membri(conChiaveNuova.stato)).toHaveLength(3);
  });

  it("chi rientra torna nel gruppo, ma non apre ancora il mazzo d'archivio", async () => {
    // **Misurato**, e S3 non l'aveva provato: il rientro porta all'epoch dopo, e
    // la serratura del mazzo è quella dell'epoch precedente. La cronologia torna
    // quando un altro membro applica il commit e riavvolge — non prima.
    const { anna, porta, statoBruno } = await casa();
    const serraturaPrima = await serraturaArchivio(statoBruno);

    const foglia = await identitaDaChiave(chi("anna"), {
      publicKey: anna.publicPackage.leafNode.signaturePublicKey,
      signKey: anna.privatePackage.signaturePrivateKey,
    });
    const tornata = await rientra(await puntoDiRientro(statoBruno), foglia, porta);

    expect(await serraturaArchivio(tornata.stato)).not.toEqual(serraturaPrima);

    // E appena Bruno applica, i due tornano a derivare la stessa serratura: è la
    // condizione che rende di nuovo leggibile la cronologia.
    const brunoDopo = await applicaHandshake(statoBruno, tornata.commit, porta);
    expect(await serraturaArchivio(brunoDopo)).toEqual(await serraturaArchivio(tornata.stato));
  });
});
