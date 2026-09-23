/**
 * La sessione: due dispositivi veri che si parlano attraverso un'istanza finta.
 *
 * L'istanza finta ([`finte.ts`](./finte.ts)) non è una scorciatoia — è una
 * riproduzione fedele delle rotte costruite lato server: il canale di handshake
 * che ordina per arrivo e consegna un Welcome solo al suo destinatario, il mazzo
 * con l'epoch che non torna indietro, l'archivio idempotente. Ciò che si prova
 * qui è **l'orchestrazione**: quando si applica un commit, in che ordine, e che
 * cosa si salva.
 */
import { describe, expect, it } from "vitest";

import { depositoFinto, istanzaFinta, portachiaviFinto } from "./finte.js";
import { epochDi, membri, rientra } from "./gruppo.js";
import {
  aggiungiMembro,
  apri,
  cronologia,
  entra,
  invia,
  riprendi,
  rientraIn,
  ruotaArchivio,
  sincronizza,
  type Contesto,
} from "./sessione.js";

/** I nomi di chi c'è: `membri` porta anche la casa (ADR 0042 §0). */
const nomi = (stato: Parameters<typeof membri>[0]): string[] =>
  membri(stato)
    .map((m) => m.username)
    .sort();

function daBase64(s: string): Uint8Array {
  const grezzo = atob(s);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) {
    bytes[i] = grezzo.charCodeAt(i);
  }
  return bytes;
}

/**
 * L'id non è il nome, e la differenza qui non è cosmetica: l'istanza consegna un
 * Welcome confrontando il destinatario con l'**id** di chi legge. Tenerli
 * diversi nei test è ciò che rende visibile lo scambio dei due.
 */
const ID_ANNA = "u-anna";
const ID_BRUNO = "u-bruno";
const ID_CARLA = "u-carla";

/** Anna apre, Bruno entra dal suo Welcome. Due depositi, un'istanza sola. */
async function dueDispositivi(): Promise<{
  istanza: ReturnType<typeof istanzaFinta>;
  anna: Contesto;
  bruno: Contesto;
  sessioneAnna: Awaited<ReturnType<typeof apri>>;
  sessioneBruno: NonNullable<Awaited<ReturnType<typeof entra>>>;
  depositoAnna: ReturnType<typeof depositoFinto>;
}> {
  const istanza = istanzaFinta();
  const chiaviAnna = await portachiaviFinto("anna");
  const chiaviBruno = await portachiaviFinto("bruno");
  istanza.ammetti("anna", chiaviAnna.chiaveDiFirma);
  istanza.ammetti("bruno", chiaviBruno.chiaveDiFirma);

  const depositoAnna = depositoFinto();
  const anna: Contesto = {
    deposito: depositoAnna,
    io: chiaviAnna,
    istanza: istanza.per(ID_ANNA),
  };
  const bruno: Contesto = {
    deposito: depositoFinto(),
    io: chiaviBruno,
    istanza: istanza.per(ID_BRUNO),
  };

  const sessioneAnna = await apri(anna, "conv-1", await chiaviBruno.pubblica(), ID_BRUNO);

  const perBruno = await bruno.istanza.handshakeDopo("conv-1");
  const welcome = perBruno.handshake.find((h) => h.tipo === "welcome")!;
  const sessioneBruno = (await entra(bruno, "conv-1", welcome))!;

  return { anna, bruno, depositoAnna, istanza, sessioneAnna, sessioneBruno };
}

describe("aprire una conversazione", () => {
  it("mette sul canale un commit per tutti e un Welcome per chi entra", async () => {
    const { istanza } = await dueDispositivi();

    const sul = istanza.depositati();
    expect(sul.map((h) => h.tipo)).toEqual(["commit", "welcome"]);
    // L'ID di chi entra, non il suo nome: e' con quello che l'istanza consegna.
    expect(sul.find((h) => h.tipo === "welcome")?.destinatario).toBe(ID_BRUNO);
    // Un commit senza destinatario: va a tutti, ed e' la regola che l'istanza
    // fa rispettare rifiutando il contrario.
    expect(sul.find((h) => h.tipo === "commit")?.destinatario).toBeUndefined();
  });

  it("il Welcome lo vede chi entra, e nessun altro", async () => {
    // Se il destinatario fosse il nome invece dell'id, questo elenco sarebbe
    // vuoto per tutti — Bruno compreso — e la conversazione non partirebbe.
    const { bruno, istanza } = await dueDispositivi();

    const suoi = await bruno.istanza.handshakeDopo("conv-1");
    const altrui = await istanza.per(ID_CARLA).handshakeDopo("conv-1");

    expect(suoi.handshake.map((h) => h.tipo)).toEqual(["commit", "welcome"]);
    expect(altrui.handshake.map((h) => h.tipo)).toEqual(["commit"]);
  });

  it("i due si trovano nello stesso gruppo, alla stessa epoch", async () => {
    const { sessioneAnna, sessioneBruno } = await dueDispositivi();

    expect(nomi(sessioneAnna.stato)).toEqual(["anna", "bruno"]);
    expect(epochDi(sessioneBruno.stato)).toBe(epochDi(sessioneAnna.stato));
  });

  it("il mazzo finisce sull'istanza, avvolto sotto l'epoch corrente", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    const avvolto = await anna.istanza.mazzo("conv-1");
    expect(avvolto?.epoch).toBe(epochDi(sessioneAnna.stato));
    expect(avvolto?.mazzo.length).toBeGreaterThan(0);
  });

  it("chi entra apre il mazzo che c'era già, e non ne crea uno nuovo", async () => {
    // Sovrascriverlo perderebbe la cronologia di tutti: è il caso che conta.
    const { sessioneAnna, sessioneBruno } = await dueDispositivi();

    const hex = (u: Uint8Array): string => Buffer.from(u).toString("hex");
    expect(sessioneBruno.catena?.map(hex)).toEqual(sessioneAnna.catena?.map(hex));
    expect(sessioneBruno.catena).toBeDefined();
  });

  it("un Welcome per una chiave che non abbiamo più non si apre, e lo dice", async () => {
    // È il browser svuotato: la chiave di firma torna dal backup, la scorta no.
    // Indovinare una chiave qui vorrebbe dire fallire più tardi e peggio.
    const istanza = istanzaFinta();
    const chiaviAnna = await portachiaviFinto("anna");
    const chiaviBruno = await portachiaviFinto("bruno");
    istanza.ammetti("anna", chiaviAnna.chiaveDiFirma);
    istanza.ammetti("bruno", chiaviBruno.chiaveDiFirma);

    const anna: Contesto = {
      deposito: depositoFinto(),
      io: chiaviAnna,
      istanza: istanza.per(ID_ANNA),
    };
    const bruno: Contesto = {
      deposito: depositoFinto(),
      io: chiaviBruno,
      istanza: istanza.per(ID_BRUNO),
    };
    await apri(anna, "conv-1", await chiaviBruno.pubblica(), ID_BRUNO);

    chiaviBruno.dimenticaLaScorta();
    const welcome = (await bruno.istanza.handshakeDopo("conv-1")).handshake.find(
      (h) => h.tipo === "welcome",
    )!;

    expect(await entra(bruno, "conv-1", welcome)).toBeUndefined();
  });
});

describe("scrivere e leggere (ADR 0043)", () => {
  it("Anna scrive, Bruno legge dalla cronologia", async () => {
    const { anna, bruno, sessioneAnna, sessioneBruno } = await dueDispositivi();

    await invia(anna, sessioneAnna, "ci vediamo alle 8", "m1", "2026-08-26T10:00:00.000Z");
    const pagina = await cronologia(bruno, sessioneBruno);

    expect(pagina.righe).toEqual([
      {
        createdAt: "2026-08-26T10:00:00.000Z",
        id: "m1",
        mittente: ID_ANNA,
        stato: "letta",
        testo: "ci vediamo alle 8",
      },
    ]);
  });

  it("scrivere deposita soltanto nell'archivio: nessuna busta di trasporto parte", async () => {
    // Una busta applicativa consegnata in casa d'altri sarebbe la copia che
    // ADR 0043 vieta. Il canale di handshake resta com'era, e l'archivio ha
    // una voce sola.
    const { anna, istanza, sessioneAnna } = await dueDispositivi();
    const primaSulCanale = istanza.depositati().length;

    await invia(anna, sessioneAnna, "i preventivi del tetto", "m1", "2026-08-26T10:00:00.000Z");

    expect(istanza.depositati()).toHaveLength(primaSulCanale);
    expect(istanza.chiamate.depositaArchivio).toBe(1);
  });

  it("nell'archivio c'è la voce cifrata, non il testo", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    await invia(anna, sessioneAnna, "i preventivi del tetto", "m1", "2026-08-26T10:00:00.000Z");

    const grezza = await anna.istanza.cronologia("conv-1");
    expect(grezza.righe[0]?.voce?.busta).toBeDefined();
    expect(grezza.righe[0]?.voce?.busta).not.toContain("preventivi");
  });

  it("scrivere non tocca lo stato del gruppo", async () => {
    // Senza trasporto, una riga non cambia l'albero: niente da salvare, e
    // niente che una scheda chiusa a metà possa lasciare a metà.
    const { anna, depositoAnna, sessioneAnna } = await dueDispositivi();

    const prima = depositoAnna.quanteScritture();
    await invia(anna, sessioneAnna, "una", "m1", "2026-08-26T10:00:00.000Z");

    expect(depositoAnna.quanteScritture()).toBe(prima);
  });
});

describe("la cronologia", () => {
  it("si rilegge in ordine", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    await invia(anna, sessioneAnna, "prima", "m1", "2026-08-26T10:00:00.000Z");
    await invia(anna, sessioneAnna, "seconda", "m2", "2026-08-26T10:01:00.000Z");

    const pagina = await cronologia(anna, sessioneAnna);
    expect(pagina.righe.map((r) => r.testo)).toEqual(["prima", "seconda"]);
  });

  it("una riga che non si apre torna senza testo, e non inventa una frase", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    await anna.istanza.depositaArchivio("conv-1", [
      { busta: btoa("non si apre"), chiaveN: 1, createdAt: "2026-08-26T10:00:00.000Z", id: "x" },
    ]);

    const pagina = await cronologia(anna, sessioneAnna);
    expect(pagina.righe[0]).toMatchObject({ id: "x", stato: "non-si-apre" });
    expect(pagina.righe[0]?.testo).toBeUndefined();
  });

  it("una riga la cui casa non risponde si dice non disponibile, con chi e quando", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();
    const lettore: Contesto = {
      ...anna,
      istanza: {
        ...anna.istanza,
        cronologia: () =>
          Promise.resolve({
            nonRispondono: ["casa-spenta"],
            righe: [
              {
                casa: "casa-spenta",
                createdAt: "2026-08-26T10:00:00.000Z",
                id: "m1",
                mittente: "matteo@casa-spenta",
                stato: "non-disponibile" as const,
              },
            ],
          }),
      },
    };

    const pagina = await cronologia(lettore, sessioneAnna);

    expect(pagina.nonRispondono).toEqual(["casa-spenta"]);
    expect(pagina.righe).toEqual([
      {
        createdAt: "2026-08-26T10:00:00.000Z",
        id: "m1",
        mittente: "matteo@casa-spenta",
        stato: "non-disponibile",
      },
    ]);
  });
});

describe("il rientro, dopo un browser svuotato (S3 via A)", () => {
  /** Bruno perde tutto: stato del gruppo e scorta. Resta la chiave di firma. */
  async function brunoSvuotato(): Promise<
    Awaited<ReturnType<typeof dueDispositivi>> & { brunoNuovo: Contesto }
  > {
    const scena = await dueDispositivi();
    const brunoNuovo: Contesto = { ...scena.bruno, deposito: depositoFinto() };
    return { ...scena, brunoNuovo };
  }

  it("si torna nel gruppo, ma senza catena finché nessuno riavvolge il mazzo", async () => {
    const { brunoNuovo } = await brunoSvuotato();

    const rientrata = await rientraIn(brunoNuovo, "conv-1");

    expect(rientrata).toBeDefined();
    expect(nomi(rientrata!.stato)).toEqual(["anna", "bruno"]);
    expect(rientrata!.catena).toBeUndefined();
  });

  it("senza catena non si scrive, e il mazzo non si tocca", async () => {
    const { brunoNuovo, istanza } = await brunoSvuotato();
    const rientrata = (await rientraIn(brunoNuovo, "conv-1"))!;
    const mazzoPrima = await brunoNuovo.istanza.mazzo("conv-1");
    const riavvolgimenti = istanza.chiamate.salvaMazzo;

    await expect(
      invia(brunoNuovo, rientrata, "nel vuoto", "m1", "2026-08-26T10:00:00.000Z"),
    ).rejects.toThrow(/non è ancora arrivata/);

    // Riprendere e sincronizzare non riavvolge un mazzo che non si conosce:
    // lo sostituirebbe, e con lui la cronologia di tutti.
    await riprendi(brunoNuovo, "conv-1");
    expect(istanza.chiamate.salvaMazzo).toBe(riavvolgimenti);
    expect(await brunoNuovo.istanza.mazzo("conv-1")).toEqual(mazzoPrima);
  });

  it("quando Anna applica il rientro e riavvolge, Bruno ritrova la cronologia", async () => {
    const { anna, brunoNuovo, sessioneAnna } = await brunoSvuotato();
    await invia(anna, sessioneAnna, "detto prima", "m1", "2026-08-26T10:00:00.000Z");

    await rientraIn(brunoNuovo, "conv-1");
    // Anna apre la conversazione: applica il commit di rientro e, avendo la
    // catena, riavvolge il mazzo sotto l'epoch nuova.
    await riprendi(anna, "conv-1");

    const ripresa = (await riprendi(brunoNuovo, "conv-1"))!;
    expect(ripresa.catena).toBeDefined();
    expect((await cronologia(brunoNuovo, ripresa)).righe.map((r) => r.testo)).toEqual([
      "detto prima",
    ]);
  });

  it("senza un punto di rientro non si rientra, e lo si dice", async () => {
    const { bruno } = await dueDispositivi();

    expect(await rientraIn(bruno, "conv-mai-nata")).toBeUndefined();
  });
});

describe("la sincronizzazione degli handshake", () => {
  it("chi era via applica il commit che si è perso, e torna allineato", async () => {
    const { anna, bruno, istanza, sessioneAnna, sessioneBruno } = await dueDispositivi();

    // Carla entra mentre Bruno non guarda.
    const chiaviCarla = await portachiaviFinto("carla");
    istanza.ammetti("carla", chiaviCarla.chiaveDiFirma);
    const conCarla = await aggiungiMembro(
      anna,
      sessioneAnna,
      await chiaviCarla.pubblica(),
      ID_CARLA,
    );

    const brunoAggiornato = await sincronizza(bruno, sessioneBruno);

    expect(epochDi(brunoAggiornato.stato)).toBe(epochDi(conCarla.stato));
    expect(nomi(brunoAggiornato.stato)).toEqual(["anna", "bruno", "carla"]);
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
    expect(nomi(ripresa!.stato)).toEqual(["anna", "bruno"]);
    expect(epochDi(ripresa!.stato)).toBe(epochDi(sessioneAnna.stato));
  });

  it("una conversazione mai aperta su questo dispositivo non si riprende", async () => {
    const { anna } = await dueDispositivi();

    expect(await riprendi(anna, "conv-mai-vista")).toBeUndefined();
  });

  it("lo stato si salva a ogni mutazione, non solo alla fine", async () => {
    const { anna, depositoAnna, istanza, sessioneAnna } = await dueDispositivi();

    const chiaviCarla = await portachiaviFinto("carla");
    istanza.ammetti("carla", chiaviCarla.chiaveDiFirma);

    const prima = depositoAnna.quanteScritture();
    await aggiungiMembro(anna, sessioneAnna, await chiaviCarla.pubblica(), ID_CARLA);

    expect(depositoAnna.quanteScritture()).toBeGreaterThan(prima);
  });
});

describe("la rotazione dell'archivio", () => {
  it("aggiunge una chiave e riavvolge il mazzo", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    const prima = await anna.istanza.mazzo("conv-1");
    const ruotata = await ruotaArchivio(anna, sessioneAnna);

    expect(ruotata.catena).toHaveLength((sessioneAnna.catena?.length ?? 0) + 1);
    expect((await anna.istanza.mazzo("conv-1"))?.mazzo).not.toBe(prima?.mazzo);
  });

  it("dopo la rotazione si scrive con la chiave nuova", async () => {
    const { anna, sessioneAnna } = await dueDispositivi();

    const ruotata = await ruotaArchivio(anna, sessioneAnna);
    await invia(anna, ruotata, "dopo l'uscita", "m1", "2026-08-26T10:00:00.000Z");

    expect((await anna.istanza.cronologia("conv-1")).righe[0]?.voce?.chiaveN).toBe(2);
  });
});

describe("il punto da cui si rientra", () => {
  it("finisce sull'istanza a ogni epoch, ed è la condizione del rientro autonomo", async () => {
    const { anna, istanza, sessioneAnna } = await dueDispositivi();

    expect(istanza.puntoDiRientro("conv-1")?.epoch).toBe(epochDi(sessioneAnna.stato));

    // E serve davvero: da quei byte si torna nel gruppo senza che nessun altro
    // sia online — che è tutta la ragione per cui si depositano.
    const punto = istanza.puntoDiRientro("conv-1")!.groupInfo;
    const tornata = await rientra(daBase64(punto), await anna.io.perNuovaFoglia(), anna.istanza);

    expect(nomi(tornata.stato)).toContain("anna");
    // La chiave di firma è la stessa, quindi la foglia si sostituisce: il gruppo
    // resta a due, e il dispositivo perduto non è più membro.
    expect(membri(tornata.stato)).toHaveLength(2);
  });

  it("lo aggiorna anche chi si limita ad applicare il commit di un altro", async () => {
    // Se lo depositasse solo chi committa, una scheda chiusa un attimo troppo
    // presto lascerebbe indietro il punto di rientro di tutti.
    const { anna, bruno, istanza, sessioneAnna, sessioneBruno } = await dueDispositivi();

    const chiaviCarla = await portachiaviFinto("carla");
    istanza.ammetti("carla", chiaviCarla.chiaveDiFirma);
    const conCarla = await aggiungiMembro(
      anna,
      sessioneAnna,
      await chiaviCarla.pubblica(),
      ID_CARLA,
    );

    const dopoIlCommit = istanza.puntoDiRientro("conv-1")?.epoch;
    await sincronizza(bruno, sessioneBruno);

    expect(dopoIlCommit).toBe(epochDi(conCarla.stato));
    expect(istanza.puntoDiRientro("conv-1")?.epoch).toBe(epochDi(conCarla.stato));
  });
});
