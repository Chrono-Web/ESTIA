/**
 * Il segnaposto, fra due case ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §4.1,
 * [ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) §3).
 *
 * Due case, due database veri, e in mezzo le regole invece del filo: la stessa
 * scelta di `feed/rete.test.ts`. Il trasporto ha le sue prove in
 * `federation.test.ts`; qui si verifica **che cosa resta dove**, e deve valere
 * in modo deterministico, non a seconda di com'è andato un handshake.
 *
 * Matteo abita a Borgo, Marco ad Aia. Matteo scrive: la voce resta a Borgo, e
 * ad Aia arriva soltanto il segno che esiste.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { openDatabase } from "../db/database.js";
import { SqliteDeviceKeysRepository } from "../dispositivi/repository.js";
import { SqliteUserRepository } from "../identity/repository.js";

import { SqliteMessaggiRepository } from "./repository.js";
import { MessaggiService, type ReteFraCase } from "./service.js";

const ORA = "2026-09-23T10:00:00.000Z";

interface Casa {
  chiave: string;
  database: DatabaseSync;
  repo: SqliteMessaggiRepository;
  messaggi: MessaggiService;
  /** Le case che rispondono, come le vede questa. Togliere una casa è spegnerla. */
  accese: Map<string, Casa>;
  abita: (username: string) => string;
  /** Quante domande ha ricevuto questa casa, per sapere se si è chiesto davvero. */
  domande: { segnaposti: number };
  orologio: { adesso: string };
}

function casa(dataDir: string, chiave: string): Casa {
  const database = openDatabase(dataDir);
  const users = new SqliteUserRepository(database);
  const repo = new SqliteMessaggiRepository(database);
  const orologio = { adesso: ORA };
  const accese = new Map<string, Casa>();
  const domande = { segnaposti: 0 };

  const messaggi = new MessaggiService({
    deviceKeys: new SqliteDeviceKeysRepository(database),
    now: () => orologio.adesso,
    repository: repo,
    users,
  });

  // La rete, in processo: ogni domanda arriva all'altra casa come se venisse
  // dal filo, con la chiave di chi chiede al posto della connessione.
  const rete: ReteFraCase = {
    casa: chiave,
    coda: () => Promise.resolve({ esito: "irraggiungibile" }),
    deposita: () => Promise.resolve({ esito: "irraggiungibile" }),
    depositaStato: () => Promise.resolve({ esito: "irraggiungibile" }),
    leggiStato: () => Promise.resolve({ esito: "irraggiungibile" }),
    segnapostiDa: (altra, conversazioneId, dopo) => {
      const lei = accese.get(altra);
      if (lei === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }

      lei.domande.segnaposti += 1;
      const finestra = lei.messaggi.segnapostiPerCasa(conversazioneId, chiave, dopo);

      return Promise.resolve(
        finestra === "rifiutato" ? { esito: "rifiutato" } : { esito: "finestra", ...finestra },
      );
    },
    spingiSegnaposti: (altra, spinta) => {
      accese.get(altra)?.messaggi.riceviSegnapostiSpinti({ ...spinta, remoteKey: chiave });
      return Promise.resolve();
    },
    visitaArchivio: (altra, conversazioneId, ids) => {
      const lei = accese.get(altra);
      if (lei === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }

      const esito = lei.messaggi.vociPerCasa(conversazioneId, chiave, ids);
      return Promise.resolve(
        esito === "rifiutato" ? { esito: "rifiutato" } : { esito: "voci", ...esito },
      );
    },
  };
  messaggi.useRete(rete);

  return {
    abita: (username) => {
      const id = randomBytes(8).toString("hex");
      users.create({
        createdAt: ORA,
        deletedAt: null,
        displayName: username,
        id,
        passwordHash: "$argon2id$finto",
        role: "member",
        username,
      });
      return id;
    },
    accese,
    chiave,
    database,
    domande,
    messaggi,
    orologio,
    repo,
  };
}

async function dueCase(use: (aia: Casa, borgo: Casa) => Promise<void>): Promise<void> {
  await withTempDataDir(async (primo) => {
    await withTempDataDir(async (secondo) => {
      const aia = casa(primo, "chiave-di-aia");
      const borgo = casa(secondo, "chiave-di-borgo");
      aia.accese.set(borgo.chiave, borgo);
      borgo.accese.set(aia.chiave, aia);

      try {
        await use(aia, borgo);
      } finally {
        aia.database.close();
        borgo.database.close();
      }
    });
  });
}

/**
 * La scena di partenza: una conversazione nata a Borgo, fra Matteo e Marco, e
 * annunciata ad Aia. Ritorna gli id che servono.
 */
async function conversazione(
  aia: Casa,
  borgo: Casa,
): Promise<{ conv: string; matteo: string; marco: string }> {
  const matteo = borgo.abita("matteo");
  const marco = aia.abita("marco");
  const conv = randomBytes(8).toString("hex");

  borgo.repo.createConversazione({
    createdAt: ORA,
    id: conv,
    membri: [matteo, `remote:${aia.chiave}:marco`],
    tipo: "diretta",
  });
  await borgo.messaggi.annunciaConversazione(matteo, conv);

  return { conv, marco, matteo };
}

/** Matteo scrive: la voce (opaca) resta a Borgo. */
function scrive(borgo: Casa, matteo: string, conv: string, id: string, quando = ORA): void {
  borgo.messaggi.depositaArchivio(matteo, conv, [
    { busta: `VOCE_CIFRATA_${id}`, chiaveN: 0, createdAt: quando, id },
  ]);
}

/** Tutto quello che il database di una casa contiene, come testo: per cercarci dentro. */
function tuttoIlDatabase(c: Casa): string {
  const tabelle = c.database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as { name: string }[];

  return tabelle
    .map(({ name }) => JSON.stringify(c.database.prepare(`SELECT * FROM "${name}"`).all()))
    .join("\n");
}

describe("l'annuncio: la casa di chi è invitato sa che la conversazione esiste", () => {
  it("la crea, con la casa che ordina scritta e i due membri", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco } = await conversazione(aia, borgo);

      expect(aia.repo.casaCheOrdina(conv)).toBe(borgo.chiave);
      expect(aia.repo.isMember(conv, marco)).toBe(true);
      expect(aia.repo.haMembroDiCasa(conv, borgo.chiave)).toBe(true);
    });
  });

  it("chi non è stato invitato non ne sa niente, e un nome sconosciuto non crea niente", async () => {
    await dueCase(async (aia, borgo) => {
      const conv = "conv-per-nessuno";

      expect(
        aia.messaggi.riceviSegnapostiSpinti({
          conversazioneId: conv,
          da: "matteo",
          destinatari: ["qualcuno-che-non-abita-qui"],
          remoteKey: borgo.chiave,
          voci: [],
        }),
      ).toBe(false);
      expect(aia.repo.casaCheOrdina(conv)).toBeUndefined();
    });
  });
});

describe("il segnaposto arriva, il contenuto no", () => {
  it("Matteo scrive: ad Aia c'è il segno, e nessun byte della voce", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);

      scrive(borgo, matteo, conv, "m-1");
      // La spinta è asincrona e senza attesa: si lascia girare il ciclo.
      await new Promise((r) => setTimeout(r, 0));

      const segni = aia.messaggi.segnaposti(marco, conv);
      expect(segni).toEqual([
        expect.objectContaining({
          casaCustode: borgo.chiave,
          id: "m-1",
          inviatoIl: ORA,
          mittente: `matteo@${borgo.chiave}`,
          seq: 1,
        }),
      ]);

      // È la verifica 6 di §4.1 e la 1 di ADR 0043: nel database di Aia non c'è
      // la voce, nemmeno cifrata.
      expect(tuttoIlDatabase(aia)).not.toContain("VOCE_CIFRATA_m-1");
      expect(tuttoIlDatabase(borgo)).toContain("VOCE_CIFRATA_m-1");
    });
  });

  it("la spinta persa si recupera chiedendo, e in ordine", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);

      // Aia è spenta mentre Matteo scrive tre messaggi: le spinte si perdono.
      borgo.accese.delete(aia.chiave);
      scrive(borgo, matteo, conv, "m-1", "2026-09-23T10:01:00.000Z");
      scrive(borgo, matteo, conv, "m-2", "2026-09-23T10:02:00.000Z");
      scrive(borgo, matteo, conv, "m-3", "2026-09-23T10:03:00.000Z");
      await new Promise((r) => setTimeout(r, 0));
      expect(aia.messaggi.segnaposti(marco, conv)).toEqual([]);

      // Aia si riaccende e chiede: tutti e tre, e in ordine (verifica 4).
      borgo.accese.set(aia.chiave, aia);
      await aia.messaggi.sincronizzaSegnaposti(conv);

      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-1", "m-2", "m-3"]);
    });
  });

  it("ritentare la stessa consegna dieci volte lascia un segnaposto solo", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      await new Promise((r) => setTimeout(r, 0));

      for (let i = 0; i < 10; i++) {
        await aia.messaggi.sincronizzaSegnaposti(conv);
      }

      expect(aia.messaggi.segnaposti(marco, conv)).toHaveLength(1);
    });
  });

  it("un id che torna con un altro mittente si rifiuta, e con lui il lotto", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      await new Promise((r) => setTimeout(r, 0));

      expect(
        aia.messaggi.riceviSegnapostiSpinti({
          conversazioneId: conv,
          da: "matteo",
          destinatari: ["marco"],
          remoteKey: borgo.chiave,
          voci: [
            { id: "m-9", inviatoIl: ORA, mittente: `matteo@${borgo.chiave}`, seq: 9 },
            { id: "m-1", inviatoIl: ORA, mittente: `luca@${borgo.chiave}`, seq: 1 },
          ],
        }),
      ).toBe(false);
      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-1"]);
    });
  });

  it("una casa non deposita segnaposto a nome di un'altra", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco } = await conversazione(aia, borgo);

      expect(
        aia.messaggi.riceviSegnapostiSpinti({
          conversazioneId: conv,
          da: "matteo",
          destinatari: ["marco"],
          remoteKey: borgo.chiave,
          voci: [{ id: "x", inviatoIl: ORA, mittente: "carla@una-terza-casa", seq: 1 }],
        }),
      ).toBe(false);
      expect(aia.messaggi.segnaposti(marco, conv)).toEqual([]);
    });
  });
});

describe("un ritirato non torna (ADR 0042 §4.1)", () => {
  /** Matteo ritira: la voce sparisce da Borgo, e il posto resta vuoto. */
  function ritira(borgo: Casa, conv: string, id: string): void {
    borgo.database
      .prepare(`DELETE FROM archivio_voci WHERE conversazione_id = ? AND id = ?`)
      .run(conv, id);
  }

  it("la finestra dichiarata cancella il segnaposto di un messaggio ritirato", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      scrive(borgo, matteo, conv, "m-2");
      await aia.messaggi.sincronizzaSegnaposti(conv);

      ritira(borgo, conv, "m-1");
      // La riconciliazione da zero arriva entro i cinque minuti.
      aia.orologio.adesso = "2026-09-23T10:06:00.000Z";
      await aia.messaggi.sincronizzaSegnaposti(conv);

      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-2"]);
    });
  });

  it("un recupero da zero non lo resuscita, e nemmeno una spinta vecchia (verifica 9)", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      scrive(borgo, matteo, conv, "m-2");
      await aia.messaggi.sincronizzaSegnaposti(conv);

      ritira(borgo, conv, "m-1");
      aia.orologio.adesso = "2026-09-23T10:06:00.000Z";
      await aia.messaggi.sincronizzaSegnaposti(conv);

      // Una spinta vecchia che porta ancora m-1: sotto il cursore, si ignora.
      aia.messaggi.riceviSegnapostiSpinti({
        conversazioneId: conv,
        da: "matteo",
        destinatari: ["marco"],
        remoteKey: borgo.chiave,
        voci: [{ id: "m-1", inviatoIl: ORA, mittente: `matteo@${borgo.chiave}`, seq: 1 }],
      });
      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-2"]);

      // E una ricostruzione da zero dà lo stesso risultato.
      aia.orologio.adesso = "2026-09-23T10:12:00.000Z";
      await aia.messaggi.sincronizzaSegnaposti(conv);
      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-2"]);
    });
  });

  it("un backup di Aia di prima del ritiro, ripristinato, si riconcilia (verifica 10)", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      scrive(borgo, matteo, conv, "m-2");
      await aia.messaggi.sincronizzaSegnaposti(conv);

      ritira(borgo, conv, "m-1");

      // Il ripristino: il segnaposto di m-1 è ancora lì, e il cursore pure.
      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-1", "m-2"]);

      aia.orologio.adesso = "2026-09-23T10:06:00.000Z";
      await aia.messaggi.sincronizzaSegnaposti(conv);

      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-2"]);
    });
  });

  it("il numero di un messaggio ritirato non si riusa", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      scrive(borgo, matteo, conv, "m-2");

      // Si ritira l'ultimo: un MAX(seq)+1 gli darebbe lo stesso numero.
      ritira(borgo, conv, "m-2");
      scrive(borgo, matteo, conv, "m-3");

      const finestra = borgo.messaggi.segnapostiPerCasa(conv, aia.chiave, 0);
      expect(finestra === "rifiutato" ? [] : finestra.voci.map((v) => [v.id, v.seq])).toEqual([
        ["m-1", 1],
        ["m-3", 3],
      ]);
    });
  });
});

describe("una casa spenta non è un messaggio ritirato", () => {
  it("con Borgo spenta i segnaposto di Matteo restano, e Borgo è detta irraggiungibile", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      await aia.messaggi.sincronizzaSegnaposti(conv);

      aia.accese.delete(borgo.chiave);
      aia.orologio.adesso = "2026-09-23T11:00:00.000Z";
      const esito = await aia.messaggi.sincronizzaSegnaposti(conv);

      expect(esito.irraggiungibili).toEqual([borgo.chiave]);
      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-1"]);
    });
  });
});

describe("chi non partecipa non chiede", () => {
  it("una casa senza membri nella conversazione riceve un rifiuto", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");

      expect(borgo.messaggi.segnapostiPerCasa(conv, "una-casa-estranea", 0)).toBe("rifiutato");
      expect(borgo.messaggi.segnapostiPerCasa("conv-che-non-esiste", aia.chiave, 0)).toBe(
        "rifiutato",
      );
    });
  });
});

describe("la cronologia si visita (ADR 0043 §2)", () => {
  it("Marco legge la parola di Matteo, e ad Aia non ne resta niente", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");

      const pagina = await aia.messaggi.cronologia(marco, conv);

      expect(pagina.righe).toEqual([
        {
          casa: borgo.chiave,
          createdAt: ORA,
          id: "m-1",
          mittente: `matteo@${borgo.chiave}`,
          stato: "disponibile",
          voce: { busta: "VOCE_CIFRATA_m-1", chiaveN: 0 },
        },
      ]);
      // La voce è passata dalla risposta, e non è stata scritta: la verifica 1
      // di ADR 0043, **dopo** una lettura.
      expect(tuttoIlDatabase(aia)).not.toContain("VOCE_CIFRATA_m-1");
    });
  });

  it("le parole delle due case si ricompongono in ordine di tempo", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1", "2026-09-23T10:01:00.000Z");
      aia.messaggi.depositaArchivio(marco, conv, [
        { busta: "VOCE_DI_MARCO", chiaveN: 0, createdAt: "2026-09-23T10:02:00.000Z", id: "a-1" },
      ]);
      scrive(borgo, matteo, conv, "m-2", "2026-09-23T10:03:00.000Z");

      const pagina = await aia.messaggi.cronologia(marco, conv);

      expect(pagina.righe.map((r) => [r.id, r.mittente])).toEqual([
        ["m-1", `matteo@${borgo.chiave}`],
        ["a-1", `marco@${aia.chiave}`],
        ["m-2", `matteo@${borgo.chiave}`],
      ]);
      // E la voce di Marco sta ad Aia soltanto: Borgo ne ha il segno.
      expect(tuttoIlDatabase(borgo)).not.toContain("VOCE_DI_MARCO");
    });
  });

  it("con Borgo spenta restano mittente e orario; riaccesa, il contenuto torna", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      await aia.messaggi.sincronizzaSegnaposti(conv);

      aia.accese.delete(borgo.chiave);
      const spenta = await aia.messaggi.cronologia(marco, conv);

      expect(spenta.nonRispondono).toEqual([borgo.chiave]);
      expect(spenta.righe).toEqual([
        {
          casa: borgo.chiave,
          createdAt: ORA,
          id: "m-1",
          mittente: `matteo@${borgo.chiave}`,
          stato: "non-disponibile",
        },
      ]);

      // È la prova centrale di ADR 0043, verifica 3: nessuna copia di ripiego,
      // e quando Borgo torna il contenuto torna dalla visita.
      aia.accese.set(borgo.chiave, borgo);
      const riaccesa = await aia.messaggi.cronologia(marco, conv);
      expect(riaccesa.righe[0]?.stato).toBe("disponibile");
      expect(riaccesa.nonRispondono).toEqual([]);
    });
  });

  it("Matteo ritira: alla lettura successiva di Marco il messaggio non c'è più", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");
      scrive(borgo, matteo, conv, "m-2");
      expect((await aia.messaggi.cronologia(marco, conv)).righe).toHaveLength(2);

      borgo.messaggi.ritiraVoce(matteo, conv, "m-1");

      // Subito, senza aspettare la riconciliazione: la visita dice che non c'è.
      const dopo = await aia.messaggi.cronologia(marco, conv);
      expect(dopo.righe.map((r) => r.id)).toEqual(["m-2"]);
      expect(aia.messaggi.segnaposti(marco, conv).map((s) => s.id)).toEqual(["m-2"]);
    });
  });

  it("si ritira soltanto la propria parola", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");

      // Marco non abita a Borgo e non ha scritto m-1: niente da ritirare.
      expect(() => aia.messaggi.ritiraVoce(marco, conv, "m-1")).toThrow();
      expect(borgo.messaggi.vociPerCasa(conv, aia.chiave, ["m-1"])).toMatchObject({
        assenti: [],
      });
    });
  });

  it("una pagina alla volta, dalla più recente", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      for (let i = 1; i <= 5; i++) {
        scrive(borgo, matteo, conv, `m-${i}`, `2026-09-23T10:0${i}:00.000Z`);
      }

      const ultima = await aia.messaggi.cronologia(marco, conv, { limite: 2 });
      expect(ultima.righe.map((r) => r.id)).toEqual(["m-4", "m-5"]);

      const precedente = await aia.messaggi.cronologia(marco, conv, {
        limite: 2,
        prima: ultima.prima,
      });
      expect(precedente.righe.map((r) => r.id)).toEqual(["m-2", "m-3"]);
    });
  });

  it("chi non partecipa non visita", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");

      expect(borgo.messaggi.vociPerCasa(conv, "una-casa-estranea", ["m-1"])).toBe("rifiutato");
    });
  });
});

describe("il Welcome per un'altra casa porta l'annuncio con sé", () => {
  it("Matteo invita Marco: la casa di Marco sa che la conversazione esiste, e chi la ordina", async () => {
    await dueCase(async (aia, borgo) => {
      const matteo = borgo.abita("matteo");
      const marco = aia.abita("marco");
      const conv = "conv-dal-welcome";
      borgo.repo.createConversazione({
        createdAt: ORA,
        id: conv,
        membri: [matteo, `remote:${aia.chiave}:marco`],
        tipo: "diretta",
      });

      await borgo.messaggi.depositaHandshake(matteo, conv, {
        busta: "COMMIT",
        epoch: 1,
        tipo: "commit",
      });
      await borgo.messaggi.depositaHandshake(matteo, conv, {
        busta: "WELCOME",
        destinatario: `remote:${aia.chiave}:marco`,
        epoch: 1,
        tipo: "welcome",
      });
      await new Promise((r) => setTimeout(r, 0));

      // Senza l'annuncio Marco non vedrebbe la conversazione, e non saprebbe
      // dove cercare il suo Welcome.
      expect(aia.repo.isMember(conv, marco)).toBe(true);
      expect(aia.repo.casaCheOrdina(conv)).toBe(borgo.chiave);
      expect(aia.messaggi.listConversazioni(marco).map((c) => [c.id, c.ordinataQui])).toEqual([
        [conv, false],
      ]);
      expect(borgo.messaggi.listConversazioni(matteo).map((c) => c.ordinataQui)).toEqual([true]);
    });
  });
});

describe("il respiro fra due domande", () => {
  it("più letture ravvicinate non moltiplicano le domande all'altra casa", async () => {
    // Una chat aperta in due schede, o due persone della stessa casa sulla
    // stessa conversazione: senza respiro, ognuna chiederebbe per conto suo, e
    // il limite di frequenza dell'altra casa scatterebbe in meno di un minuto.
    await dueCase(async (aia, borgo) => {
      const { conv, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1");

      await aia.messaggi.sincronizzaSegnaposti(conv);
      const dopoLaPrima = borgo.domande.segnaposti;

      aia.orologio.adesso = "2026-09-23T10:00:05.000Z";
      await aia.messaggi.sincronizzaSegnaposti(conv);
      await aia.messaggi.sincronizzaSegnaposti(conv);
      expect(borgo.domande.segnaposti).toBe(dopoLaPrima);

      // Passati dieci secondi, si torna a chiedere.
      aia.orologio.adesso = "2026-09-23T10:00:11.000Z";
      await aia.messaggi.sincronizzaSegnaposti(conv);
      expect(borgo.domande.segnaposti).toBeGreaterThan(dopoLaPrima);
    });
  });
});

describe("l'elenco delle conversazioni vede le chat MLS", () => {
  it("ultimo messaggio e non letti vengono dalle voci e dai segnaposto", async () => {
    // Senza, una chat MLS sembrerebbe sempre vuota e senza novità: le sue
    // parole non stanno in `messaggi`, stanno nell'archivio di chi scrive.
    await dueCase(async (aia, borgo) => {
      const { conv, marco, matteo } = await conversazione(aia, borgo);
      scrive(borgo, matteo, conv, "m-1", "2026-09-23T10:01:00.000Z");
      scrive(borgo, matteo, conv, "m-2", "2026-09-23T10:02:00.000Z");
      await aia.messaggi.sincronizzaSegnaposti(conv);

      const perMarco = aia.messaggi.listConversazioni(marco)[0];
      expect(perMarco?.ultimoMessaggio).toEqual({
        createdAt: "2026-09-23T10:02:00.000Z",
        id: "m-2",
        senderUserId: `remote:${borgo.chiave}:matteo`,
      });
      expect(perMarco?.nonLetti).toBe(2);

      // Per Matteo le sue parole non sono «non lette».
      const perMatteo = borgo.messaggi.listConversazioni(matteo)[0];
      expect(perMatteo?.ultimoMessaggio?.id).toBe("m-2");
      expect(perMatteo?.nonLetti).toBe(0);
    });
  });
});
