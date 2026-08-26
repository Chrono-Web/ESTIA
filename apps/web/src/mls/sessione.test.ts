/**
 * La sessione: due dispositivi veri che si parlano attraverso un'istanza finta.
 *
 * L'istanza finta non è una scorciatoia — è una riproduzione fedele delle rotte
 * costruite lato server: il canale di handshake che ordina per arrivo, il mazzo
 * con l'epoch che non torna indietro, l'archivio idempotente. Ciò che si prova
 * qui è **l'orchestrazione**: quando si applica un commit, in che ordine, e che
 * cosa si salva.
 */
import { describe, expect, it } from "vitest";

import { nuovaIdentita, membri, epochDi, type IdentitaDispositivo } from "./gruppo.js";
import {
  aggiungiMembro,
  apri,
  cronologia,
  entra,
  invia,
  ricevi,
  riprendi,
  ruotaArchivio,
  sincronizza,
  type BustaHandshake,
  type Contesto,
  type Deposito,
  type Istanza,
  type VoceArchivio,
} from "./sessione.js";

/** Un'istanza in memoria che si comporta come quella vera. */
function istanzaFinta(): Istanza & {
  ammetti: (username: string, chi: IdentitaDispositivo) => void;
  /** Cio' che e' stato depositato, destinatario compreso: la rotta vera non lo
   *  restituisce — lo usa per filtrare — quindi per guardarlo serve di qui. */
  depositati: () => readonly (BustaHandshake & { destinatario?: string })[];
  chiamate: { salvaMazzo: number; depositaArchivio: number };
} {
  const chiavi = new Map<string, Uint8Array[]>();
  const handshake: (BustaHandshake & { destinatario?: string })[] = [];
  const mazzi = new Map<string, { mazzo: string; epoch: number }>();
  const archivio = new Map<string, VoceArchivio[]>();
  const chiamate = { depositaArchivio: 0, salvaMazzo: 0 };
  let seq = 0;

  return {
    ammetti(username, chi) {
      chiavi.set(username, [
        ...(chiavi.get(username) ?? []),
        chi.publicPackage.leafNode.signaturePublicKey,
      ]);
    },
    archivio(conversazioneId) {
      return Promise.resolve({ voci: [...(archivio.get(conversazioneId) ?? [])] });
    },
    chiamate,
    chiaviDiFirmaDi: (username) => Promise.resolve(chiavi.get(username) ?? []),
    depositaArchivio(conversazioneId, voci) {
      chiamate.depositaArchivio += 1;
      const attuali = archivio.get(conversazioneId) ?? [];
      // Idempotente per (conversazione, id), come la tabella vera.
      for (const voce of voci) {
        if (!attuali.some((v) => v.id === voce.id)) {
          attuali.push(voce);
        }
      }
      archivio.set(conversazioneId, attuali);
      return Promise.resolve();
    },
    depositati: () => handshake,
    depositaHandshake(_conversazioneId, busta) {
      seq += 1;
      handshake.push({ ...busta, id: String(seq) });
      return Promise.resolve();
    },
    handshakeDopo(_conversazioneId, dopo) {
      // Ordine di ARRIVO, come `seq` lato istanza.
      const da = dopo === undefined ? 0 : Number(dopo);
      return Promise.resolve({ handshake: handshake.filter((h) => Number(h.id) > da) });
    },
    mazzo: (conversazioneId) => Promise.resolve(mazzi.get(conversazioneId)),
    salvaMazzo(conversazioneId, dati) {
      chiamate.salvaMazzo += 1;
      const attuale = mazzi.get(conversazioneId);
      // L'epoch non torna indietro, come lato istanza.
      if (attuale === undefined || attuale.epoch <= dati.epoch) {
        mazzi.set(conversazioneId, dati);
      }
      return Promise.resolve();
    },
  };
}

function depositoFinto(): Deposito & { quanteScritture: () => number } {
  const stati = new Map<string, Uint8Array>();
  const cursori = new Map<string, string>();
  let scritture = 0;

  return {
    leggi: (id) => Promise.resolve(stati.get(id)),
    leggiCursore: (id) => Promise.resolve(cursori.get(id)),
    quanteScritture: () => scritture,
    scrivi(id, stato) {
      scritture += 1;
      stati.set(id, stato);
      return Promise.resolve();
    },
    scriviCursore(id, cursore) {
      cursori.set(id, cursore);
      return Promise.resolve();
    },
  };
}

/** Anna apre, Bruno entra dal suo Welcome. Due depositi, un'istanza sola. */
async function dueDispositivi(): Promise<{
  istanza: ReturnType<typeof istanzaFinta>;
  anna: Contesto;
  bruno: Contesto;
  sessioneAnna: Awaited<ReturnType<typeof apri>>;
  sessioneBruno: Awaited<ReturnType<typeof apri>>;
  depositoAnna: ReturnType<typeof depositoFinto>;
}> {
  const istanza = istanzaFinta();
  const idAnna = await nuovaIdentita("anna");
  const idBruno = await nuovaIdentita("bruno");
  istanza.ammetti("anna", idAnna);
  istanza.ammetti("bruno", idBruno);

  const depositoAnna = depositoFinto();
  const anna: Contesto = { deposito: depositoAnna, io: idAnna, istanza };
  const bruno: Contesto = { deposito: depositoFinto(), io: idBruno, istanza };

  const sessioneAnna = await apri(anna, "conv-1", idBruno.publicPackage, "bruno");

  const perBruno = await istanza.handshakeDopo("conv-1");
  const welcome = perBruno.handshake.find((h) => h.tipo === "welcome")!;
  const sessioneBruno = await entra(bruno, "conv-1", welcome, sessioneAnna.stato.ratchetTree);

  return { anna, bruno, depositoAnna, istanza, sessioneAnna, sessioneBruno };
}

describe("aprire una conversazione", () => {
  it("mette sul canale un commit per tutti e un Welcome per chi entra", async () => {
    const { istanza } = await dueDispositivi();

    const sul = istanza.depositati();
    expect(sul.map((h) => h.tipo)).toEqual(["commit", "welcome"]);
    expect(sul.find((h) => h.tipo === "welcome")?.destinatario).toBe("bruno");
    // Un commit senza destinatario: va a tutti, ed e' la regola che l'istanza
    // fa rispettare rifiutando il contrario.
    expect(sul.find((h) => h.tipo === "commit")?.destinatario).toBeUndefined();
  });

  it("i due si trovano nello stesso gruppo, alla stessa epoch", async () => {
    const { sessioneAnna, sessioneBruno } = await dueDispositivi();

    expect(membri(sessioneAnna.stato).sort()).toEqual(["anna", "bruno"]);
    expect(epochDi(sessioneBruno.stato)).toBe(epochDi(sessioneAnna.stato));
  });

  it("il mazzo finisce sull'istanza, avvolto sotto l'epoch corrente", async () => {
    const { istanza, sessioneAnna } = await dueDispositivi();

    const avvolto = await istanza.mazzo("conv-1");
    expect(avvolto?.epoch).toBe(epochDi(sessioneAnna.stato));
    expect(avvolto?.mazzo.length).toBeGreaterThan(0);
  });

  it("chi entra apre il mazzo che c'era già, e non ne crea uno nuovo", async () => {
    // Sovrascriverlo perderebbe la cronologia di tutti: è il caso che conta.
    const { sessioneAnna, sessioneBruno } = await dueDispositivi();

    const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");
    expect(sessioneBruno.catena.map(hex)).toEqual(sessioneAnna.catena.map(hex));
  });
});

describe("mandare e ricevere", () => {
  it("porta il testo dall'una all'altra", async () => {
    const { anna, bruno, sessioneAnna, sessioneBruno } = await dueDispositivi();

    const inviato = await invia(
      anna,
      sessioneAnna,
      "ci vediamo alle 8",
      "m1",
      "2026-08-26T10:00:00.000Z",
    );
    const letto = await ricevi(
      bruno,
      sessioneBruno,
      inviato.busta,
      "m1",
      "2026-08-26T10:00:00.000Z",
    );

    expect(letto.kind).toBe("messaggio");
    if (letto.kind === "messaggio") {
      expect(letto.testo).toBe("ci vediamo alle 8");
    }
  });

  it("archivia nello stesso gesto in cui cifra", async () => {
    const { anna, istanza, sessioneAnna } = await dueDispositivi();

    await invia(anna, sessioneAnna, "i preventivi del tetto", "m1", "2026-08-26T10:00:00.000Z");

    const archiviato = await istanza.archivio("conv-1");
    expect(archiviato.voci).toHaveLength(1);
    expect(archiviato.voci[0]?.id).toBe("m1");
    // Nell'archivio c'è la busta, non il testo.
    expect(archiviato.voci[0]?.busta).not.toContain("preventivi");
  });

  it("archiviare due volte lo stesso messaggio non lo duplica", async () => {
    const { anna, bruno, istanza, sessioneAnna, sessioneBruno } = await dueDispositivi();

    const inviato = await invia(
      anna,
      sessioneAnna,
      "una volta sola",
      "m1",
      "2026-08-26T10:00:00.000Z",
    );
    await ricevi(bruno, sessioneBruno, inviato.busta, "m1", "2026-08-26T10:00:00.000Z");

    // Anna ha archiviato scrivendo, Bruno leggendo: la voce resta una.
    expect((await istanza.archivio("conv-1")).voci).toHaveLength(1);
  });

  it("un messaggio che non si apre resta illeggibile e non finisce in archivio", async () => {
    const { bruno, istanza, sessioneBruno } = await dueDispositivi();

    const esito = await ricevi(
      bruno,
      sessioneBruno,
      btoa("spazzatura"),
      "m9",
      "2026-08-26T10:00:00.000Z",
    );

    expect(esito.kind).toBe("illeggibile");
    expect((await istanza.archivio("conv-1")).voci).toHaveLength(0);
  });
});

describe("la cronologia", () => {
  it("si rilegge dall'archivio, in ordine", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    let s = sessioneAnna;
    s = (await invia(anna, s, "prima", "m1", "2026-08-26T10:00:00.000Z")).sessione;
    s = (await invia(anna, s, "seconda", "m2", "2026-08-26T10:01:00.000Z")).sessione;

    const righe = await cronologia(anna, { ...s, catena: sessioneAnna.catena });
    expect(righe.map((r) => r.testo)).toEqual(["prima", "seconda"]);
  });

  it("una riga che non si apre torna senza testo, e non inventa una frase", async () => {
    const { anna, istanza, sessioneAnna } = await dueDispositivi();

    await istanza.depositaArchivio("conv-1", [
      { busta: btoa("non si apre"), chiaveN: 1, createdAt: "2026-08-26T10:00:00.000Z", id: "x" },
    ]);

    const righe = await cronologia(anna, sessioneAnna);
    expect(righe[0]?.testo).toBeUndefined();
  });
});

describe("la sincronizzazione degli handshake", () => {
  it("chi era via applica il commit che si è perso, e torna allineato", async () => {
    const { anna, bruno, istanza, sessioneAnna, sessioneBruno } = await dueDispositivi();

    // Carla entra mentre Bruno non guarda.
    const idCarla = await nuovaIdentita("carla");
    istanza.ammetti("carla", idCarla);
    const conCarla = await aggiungiMembro(anna, sessioneAnna, idCarla.publicPackage, "carla");

    const brunoAggiornato = await sincronizza(bruno, sessioneBruno);

    expect(epochDi(brunoAggiornato.stato)).toBe(epochDi(conCarla.stato));
    expect(membri(brunoAggiornato.stato).sort()).toEqual(["anna", "bruno", "carla"]);
  });

  it("sincronizzare due volte non riapplica niente", async () => {
    const { bruno, sessioneBruno } = await dueDispositivi();

    const prima = await sincronizza(bruno, sessioneBruno);
    const seconda = await sincronizza(bruno, prima);

    expect(epochDi(seconda.stato)).toBe(epochDi(prima.stato));
  });
});

describe("riprendere dopo aver chiuso la scheda", () => {
  it("lo stato salvato si rilegge, e il gruppo è quello di prima", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    const ripresa = await riprendi(anna, "conv-1");

    expect(ripresa).toBeDefined();
    expect(membri(ripresa!.stato).sort()).toEqual(["anna", "bruno"]);
    expect(epochDi(ripresa!.stato)).toBe(epochDi(sessioneAnna.stato));
  });

  it("una conversazione mai aperta su questo dispositivo non si riprende", async () => {
    const { anna } = await dueDispositivi();

    expect(await riprendi(anna, "conv-mai-vista")).toBeUndefined();
  });

  it("lo stato si salva a ogni mutazione, non solo alla fine", async () => {
    const { anna, depositoAnna, sessioneAnna } = await dueDispositivi();

    const prima = depositoAnna.quanteScritture();
    await invia(anna, sessioneAnna, "una", "m1", "2026-08-26T10:00:00.000Z");

    expect(depositoAnna.quanteScritture()).toBeGreaterThan(prima);
  });
});

describe("la rotazione dell'archivio", () => {
  it("aggiunge una chiave e riavvolge il mazzo", async () => {
    const { anna, istanza, sessioneAnna } = await dueDispositivi();

    const prima = await istanza.mazzo("conv-1");
    const ruotata = await ruotaArchivio(anna, sessioneAnna);

    expect(ruotata.catena).toHaveLength(sessioneAnna.catena.length + 1);
    expect((await istanza.mazzo("conv-1"))?.mazzo).not.toBe(prima?.mazzo);
  });

  it("dopo la rotazione si scrive con la chiave nuova", async () => {
    const { anna, istanza, sessioneAnna } = await dueDispositivi();

    const ruotata = await ruotaArchivio(anna, sessioneAnna);
    await invia(anna, ruotata, "dopo l'uscita", "m1", "2026-08-26T10:00:00.000Z");

    expect((await istanza.archivio("conv-1")).voci[0]?.chiaveN).toBe(2);
  });
});
