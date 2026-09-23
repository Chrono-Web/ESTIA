/**
 * Due case vere, due persone, MLS vero: il percorso intero di una chat fra
 * istanze ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md),
 * [ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md)).
 *
 * Qui dentro c'è tutto quello che un'installazione da zero usa davvero, tranne
 * una cosa:
 *
 * - **due istanze intere** (`buildApp`), ciascuna col suo database e le sue
 *   rotte HTTP;
 * - **il client MLS del browser** — `conversazione`, `sessione`,
 *   `dispositivo`, `gruppo` — che parla a quelle rotte come parla la schermata;
 * - **al posto di iroh**, un filo in processo: ogni domanda che una casa fa
 *   all'altra arriva alle stesse funzioni con cui l'altra risponde sul filo,
 *   con la chiave di chi chiede al posto della connessione.
 *
 * Il filo vero ha le sue prove, operazione per operazione, in
 * `federation/federation.test.ts`, con endpoint iroh veri. Qui si prova che le
 * otto operazioni, messe in fila da un client vero, fanno una chat: è la
 * stessa scelta di `feed/rete.test.ts` e `segnaposti.test.ts`, portata fino al
 * client. Su `local` una chiave non si risolve e due istanze non si possono
 * chiamare a vicenda; su `internet` una prova dipenderebbe dai server di n0.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { loadConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  apriConversazione,
  leggi,
  manda,
  type Invito,
} from "../../../web/src/mls/conversazione.js";
import { ALGORITMO, preparaDispositivo, type Anagrafe } from "../../../web/src/mls/dispositivo.js";
import { cassettoFinto, depositoFinto } from "../../../web/src/mls/finte.js";
import { leggiKeyPackage } from "../../../web/src/mls/gruppo.js";
import type { Contesto, Istanza, Sessione } from "../../../web/src/mls/sessione.js";
import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-due-case-mls";

interface Casa {
  app: FastifyInstance;
  dataDir: string;
  /** La chiave della casa: quella con cui l'altra la nomina, e che firma le credenziali. */
  casa: string;
  token: string;
  username: string;
  /** Il client di questa persona, sul suo browser. */
  ctx: Contesto;
}

class ErroreHttp extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function chiama(
  app: FastifyInstance,
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: unknown,
): Promise<unknown> {
  const res = await app.inject({
    headers: { authorization: `Bearer ${token}` },
    method,
    url,
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });

  if (res.statusCode === 204) {
    return undefined;
  }

  const corpo = res.body.length === 0 ? undefined : (JSON.parse(res.body) as unknown);
  if (res.statusCode >= 400) {
    const errore = corpo as { code?: string; message?: string } | undefined;
    throw new ErroreHttp(res.statusCode, errore?.code ?? "?", errore?.message ?? res.body);
  }

  return corpo;
}

/** `undefined` su 404: «non c'è ancora», come negli adattatori del browser. */
async function seEsiste<T>(chiamata: Promise<unknown>): Promise<T | undefined> {
  try {
    return (await chiamata) as T;
  } catch (causa) {
    if (causa instanceof ErroreHttp && causa.status === 404) {
      return undefined;
    }
    throw causa;
  }
}

const daB64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

/**
 * L'istanza vista dal client, sulle rotte vere. È `istanzaSuApi` di
 * `adattatori.ts` con `app.inject` al posto di `fetch`: stessi percorsi, stessa
 * regola di instradamento del registro.
 */
function istanzaSu(app: FastifyInstance, token: string, casa: string): Istanza {
  const conv = (id: string): string => `/api/v1/conversazioni/${encodeURIComponent(id)}`;

  return {
    async chiaviDiFirmaDi(membro) {
      const url =
        membro.casa === casa
          ? `/api/v1/dispositivi/di/${membro.username}/chiavi`
          : `/api/v1/mls/chiavi/${membro.casa}/${membro.username}`;
      const registro = (await chiama(app, token, "GET", url)) as {
        chiavi: { publicKey: string; algorithm: string }[];
      };
      return registro.chiavi
        .filter((c) => c.algorithm === ALGORITMO)
        .map((c) => daB64(c.publicKey));
    },
    cronologia: async (id, prima) =>
      (await chiama(
        app,
        token,
        "GET",
        `${conv(id)}/cronologia${prima === undefined ? "" : `?prima=${encodeURIComponent(prima)}`}`,
      )) as Awaited<ReturnType<Istanza["cronologia"]>>,
    depositaArchivio: async (id, voci) => {
      await chiama(app, token, "POST", `${conv(id)}/archivio`, { voci });
    },
    depositaHandshake: async (id, busta) => {
      await chiama(app, token, "POST", `${conv(id)}/handshake`, busta);
    },
    handshakeDopo: async (id, dopo) =>
      (await chiama(
        app,
        token,
        "GET",
        `${conv(id)}/handshake${dopo === undefined ? "" : `?dopo=${encodeURIComponent(dopo)}`}`,
      )) as Awaited<ReturnType<Istanza["handshakeDopo"]>>,
    mazzo: (id) => seEsiste(chiama(app, token, "GET", `${conv(id)}/archivio/chiavi`)),
    puntoDiRientro: (id) => seEsiste(chiama(app, token, "GET", `${conv(id)}/group-info`)),
    salvaMazzo: async (id, dati) => {
      await chiama(app, token, "PUT", `${conv(id)}/archivio/chiavi`, dati);
    },
    salvaPuntoDiRientro: async (id, dati) => {
      await chiama(app, token, "PUT", `${conv(id)}/group-info`, dati);
    },
  };
}

/** L'anagrafe vera: `device_keys`, i KeyPackage e il backup, sulle rotte. */
function anagrafeSu(app: FastifyInstance, token: string): Anagrafe {
  return {
    leggiBackup: () => seEsiste(chiama(app, token, "GET", "/api/v1/dispositivi/backup")),
    pubblica: async (keyPackages) => {
      await chiama(app, token, "POST", "/api/v1/dispositivi/key-packages", { keyPackages });
    },
    registra: async (chiave) => {
      const r = (await chiama(app, token, "POST", "/api/v1/dispositivi/chiave", chiave)) as {
        device: { id: string };
      };
      return { deviceId: r.device.id };
    },
    salvaBackup: async (backup) => {
      await chiama(app, token, "PUT", "/api/v1/dispositivi/backup", backup);
    },
  };
}

/** Una casa installata da zero, con una persona dentro e il suo browser pronto. */
async function casaNuova(dataDir: string, nome: string, username: string): Promise<Casa> {
  const app = await buildApp(
    loadConfig({ ESTIA_DATA_DIR: dataDir, ESTIA_HOST: "127.0.0.1", ESTIA_LOG_LEVEL: "silent" }),
    { setupToken: SETUP_TOKEN },
  );

  const password = `password-lunga-di-${username}`;
  await app.inject({
    method: "POST",
    payload: {
      adminPassword: password,
      adminUsername: username,
      name: nome,
      setupToken: SETUP_TOKEN,
    },
    url: "/api/v1/instance/setup",
  });
  const login = await app.inject({
    method: "POST",
    payload: { password, username },
    url: "/api/v1/auth/login",
  });
  const token = (JSON.parse(login.body) as { token: string }).token;
  const { casa } = (await chiama(app, token, "GET", "/api/v1/mls/casa")) as { casa: string };

  const dispositivo = await preparaDispositivo(
    { anagrafe: anagrafeSu(app, token), casa, cassetto: cassettoFinto() },
    username,
  );

  return {
    app,
    casa,
    ctx: {
      deposito: depositoFinto(),
      io: dispositivo.portachiavi,
      istanza: istanzaSu(app, token, casa),
    },
    dataDir,
    token,
    username,
  };
}

/**
 * Il filo fra le due case, in processo.
 *
 * Ogni metodo che la federazione usa per chiedere qualcosa a un'altra casa
 * viene sostituito da una chiamata alle stesse funzioni che l'altra casa usa
 * per rispondere — `vociPerCasa`, `segnapostiPerCasa`, `handshakeRemoti`… —
 * con la chiave di chi chiede al posto di quella della connessione. `accese`
 * dice quali case rispondono: togliere una chiave è spegnere una casa.
 */
function collega(a: Casa, b: Casa): Set<string> {
  const accese = new Set([a.casa, b.casa]);
  const perChiave = new Map([
    [a.casa, a],
    [b.casa, b],
  ]);

  for (const io of [a, b]) {
    const lei = (chiave: string): Casa | undefined =>
      accese.has(chiave) ? perChiave.get(chiave) : undefined;
    const filo = io.app.federationService as unknown as Record<string, unknown>;

    filo.fetchChiavi = (
      chiave: string,
      _chi: unknown,
      opzioni: { destinatario: string; algoritmo?: string },
    ) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const preso = l.app.dispositiviService.claimKeyPackagePerNome(
        opzioni.destinatario,
        opzioni.algoritmo,
      );
      return Promise.resolve(
        preso?.keyPackage
          ? { esito: "chiavi", packages: [{ blob: preso.keyPackage, id: preso.deviceId }] }
          : { esito: "nessuna" },
      );
    };

    filo.fetchChiaviDiFirma = (chiave: string, chi: string) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const chiavi = l.app.dispositiviService.chiaviDiFirmaDi(chi).chiavi;
      return Promise.resolve(
        chiavi.length > 0 ? { chiavi, esito: "chiavi" } : { esito: "nessuna" },
      );
    };

    filo.depositaHandshakePresso = (
      chiave: string,
      conversazioneId: string,
      busta: Parameters<FastifyInstance["messaggiService"]["depositaHandshakeRemoto"]>[0],
    ) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const esito = l.app.messaggiService.depositaHandshakeRemoto({
        ...busta,
        conversazioneId,
        remoteKey: io.casa,
      });
      return Promise.resolve(
        esito === undefined
          ? { esito: "rifiutato" }
          : esito === "indietro"
            ? { esito: "indietro" }
            : { esito: "depositato" },
      );
    };

    filo.fetchHandshake = (chiave: string, conversazioneId: string, dopo?: string) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const coda = l.app.messaggiService.handshakeRemoti(
        conversazioneId,
        io.casa,
        dopo === undefined ? {} : { dopo },
      );
      return Promise.resolve(
        coda === undefined
          ? { esito: "rifiutato" }
          : {
              esito: "coda",
              handshake: coda.handshake.map(({ seq: _seq, ...voce }) => voce),
              ...(coda.prossimo === undefined ? {} : { prossimo: coda.prossimo }),
            },
      );
    };

    filo.leggiStatoPresso = (
      chiave: string,
      conversazioneId: string,
      tipo: "group-info" | "mazzo",
    ) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const stato = l.app.messaggiService.statoRemoto(conversazioneId, io.casa, tipo);
      return Promise.resolve(
        stato === "rifiutato"
          ? { esito: "rifiutato" }
          : stato === undefined
            ? { esito: "assente" }
            : { ...stato, esito: "stato" },
      );
    };

    filo.depositaStatoPresso = (
      chiave: string,
      conversazioneId: string,
      tipo: "group-info" | "mazzo",
      stato: { blob: string; epoch: number },
    ) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const esito = l.app.messaggiService.depositaStatoRemoto(
        conversazioneId,
        io.casa,
        tipo,
        stato,
      );
      return Promise.resolve(
        esito === "rifiutato"
          ? { esito: "rifiutato" }
          : esito === "indietro"
            ? { esito: "indietro" }
            : { esito: "depositato", updatedAt: esito.updatedAt },
      );
    };

    filo.segnapostiDaPresso = (chiave: string, conversazioneId: string, dopo: number) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const finestra = l.app.messaggiService.segnapostiPerCasa(conversazioneId, io.casa, dopo);
      return Promise.resolve(
        finestra === "rifiutato" ? { esito: "rifiutato" } : { ...finestra, esito: "finestra" },
      );
    };

    filo.spingiSegnapostiA = (
      chiave: string,
      spinta: Omit<
        Parameters<FastifyInstance["messaggiService"]["riceviSegnapostiSpinti"]>[0],
        "remoteKey"
      >,
    ) => {
      lei(chiave)?.app.messaggiService.riceviSegnapostiSpinti({ ...spinta, remoteKey: io.casa });
      return Promise.resolve();
    };

    filo.visitaArchivioPresso = (chiave: string, conversazioneId: string, ids: string[]) => {
      const l = lei(chiave);
      if (l === undefined) {
        return Promise.resolve({ esito: "irraggiungibile" });
      }
      const esito = l.app.messaggiService.vociPerCasa(conversazioneId, io.casa, ids);
      return Promise.resolve(
        esito === "rifiutato" ? { esito: "rifiutato" } : { ...esito, esito: "voci" },
      );
    };
  }

  return accese;
}

/** Ogni byte di ogni file del database di una casa, come testo: per cercarci dentro. */
function tuttiIFile(c: Casa): string {
  return readdirSync(c.dataDir)
    .filter((nome) => nome.startsWith("estia.db"))
    .map((nome) => readFileSync(path.join(c.dataDir, nome)).toString("latin1"))
    .join("\n");
}

async function dueCase(
  use: (aia: Casa, borgo: Casa, accese: Set<string>) => Promise<void>,
): Promise<void> {
  await withTempDataDir(async (primo) => {
    await withTempDataDir(async (secondo) => {
      const aia = await casaNuova(primo, "Aia", "anna");
      const borgo = await casaNuova(secondo, "Borgo", "bruno");
      const accese = collega(aia, borgo);

      try {
        await use(aia, borgo, accese);
      } finally {
        await aia.app.close();
        await borgo.app.close();
      }
    });
  });
}

/** Il nome della persona dall'altra parte, come lo vede la conversazione di questa casa. */
function invitoPer(chi: Casa, altra: Casa, conversazione: { membri: { id: string }[] }): Invito {
  return async () => {
    const preso = (await chiama(
      chi.app,
      chi.token,
      "GET",
      `/api/v1/mls/key-package/${altra.casa}/${altra.username}`,
    )) as { keyPackage: string };
    const keyPackage = leggiKeyPackage(daB64(preso.keyPackage));
    if (keyPackage === undefined) {
      throw new Error("KeyPackage illeggibile");
    }

    const idDiChiEntra = conversazione.membri.find((m) => m.id.startsWith("remote:"))!.id;
    return { idDiChiEntra, keyPackage };
  };
}

const nessunInvito: Invito = () => Promise.reject(new Error("Chi sta altrove non invita"));

interface VistaConversazione {
  id: string;
  ordinataQui: boolean;
  membri: { id: string; username: string }[];
}

/**
 * La scena di partenza, fatta come la fa la schermata: Anna cerca Bruno, apre
 * la conversazione dalla sua casa e il suo browser crea il gruppo; Bruno trova
 * la conversazione nella sua e ci entra dal Welcome.
 */
async function conversazioneAperta(
  aia: Casa,
  borgo: Casa,
): Promise<{ conv: string; sessioneAnna: Sessione; sessioneBruno: Sessione }> {
  const creata = (await chiama(aia.app, aia.token, "POST", "/api/v1/conversazioni", {
    recipientUsername: borgo.username,
    remoteInstanceKey: borgo.casa,
  })) as { conversazione: VistaConversazione };
  const perAnna = creata.conversazione;
  expect(perAnna.ordinataQui).toBe(true);

  const aperturaAnna = await apriConversazione(aia.ctx, perAnna, invitoPer(aia, borgo, perAnna));
  if (aperturaAnna.kind !== "pronta") {
    throw new Error("La conversazione di Anna doveva aprirsi");
  }

  // L'annuncio è partito con il Welcome: la casa di Bruno la conosce.
  const diBruno = (await chiama(borgo.app, borgo.token, "GET", "/api/v1/conversazioni")) as {
    conversazioni: VistaConversazione[];
  };
  const perBruno = diBruno.conversazioni.find((c) => c.id === perAnna.id);
  expect(perBruno?.ordinataQui).toBe(false);

  const aperturaBruno = await apriConversazione(borgo.ctx, perBruno!, nessunInvito);
  if (aperturaBruno.kind !== "pronta") {
    throw new Error("Bruno doveva entrare dal Welcome");
  }

  return {
    conv: perAnna.id,
    sessioneAnna: aperturaAnna.sessione,
    sessioneBruno: aperturaBruno.sessione,
  };
}

describe("una chat fra due case, dall'installazione alla risposta", () => {
  it("Anna scrive da Aia, Bruno legge da Borgo, risponde, e Anna legge", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, sessioneAnna, sessioneBruno } = await conversazioneAperta(aia, borgo);

      await manda(
        aia.ctx,
        sessioneAnna,
        { testo: "Ciao Bruno, alle otto in piazza" },
        "m-anna",
        "2026-09-23T18:00:00.000Z",
      );
      const letturaBruno = await leggi(borgo.ctx, sessioneBruno);
      expect(letturaBruno.righe.map((r) => [r.mittente, r.testo])).toEqual([
        [`anna@${aia.casa}`, "Ciao Bruno, alle otto in piazza"],
      ]);

      await manda(
        borgo.ctx,
        letturaBruno.sessione,
        { risponde: "m-anna", testo: "Perfetto, porto io il pane" },
        "m-bruno",
        "2026-09-23T18:01:00.000Z",
      );
      const letturaAnna = await leggi(aia.ctx, sessioneAnna);
      expect(letturaAnna.righe.map((r) => [r.mittente, r.testo, r.risponde])).toEqual([
        [`anna@${aia.casa}`, "Ciao Bruno, alle otto in piazza", undefined],
        [`bruno@${borgo.casa}`, "Perfetto, porto io il pane", "m-anna"],
      ]);

      // La conversazione la ordina Aia: la coda sta là, e Borgo non ne ha una.
      expect(borgo.app.messaggiService.handshakeRemoti(conv, aia.casa)).toBeUndefined();
    });
  }, 60_000);

  it("nessuna casa conserva la voce dell'altra, nemmeno cifrata (ADR 0043, verifica 1)", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, sessioneAnna, sessioneBruno } = await conversazioneAperta(aia, borgo);

      await manda(
        aia.ctx,
        sessioneAnna,
        { testo: "segreto di Anna" },
        "m-anna",
        "2026-09-23T18:00:00.000Z",
      );
      await manda(
        borgo.ctx,
        sessioneBruno,
        { testo: "segreto di Bruno" },
        "m-bruno",
        "2026-09-23T18:01:00.000Z",
      );
      await leggi(aia.ctx, sessioneAnna);
      await leggi(borgo.ctx, sessioneBruno);

      // Le voci cifrate, come ciascuna casa le serve all'altra per i suoi autori.
      const vocedi = (autore: Casa, lettore: Casa, id: string): string => {
        const esito = autore.app.messaggiService.vociPerCasa(conv, lettore.casa, [id]);
        return esito === "rifiutato" ? "" : (esito.voci[0]?.busta ?? "");
      };

      const diAnna = vocedi(aia, borgo, "m-anna");
      const diBruno = vocedi(borgo, aia, "m-bruno");
      expect(diAnna.length).toBeGreaterThan(0);
      expect(diBruno.length).toBeGreaterThan(0);

      // Dopo le letture: ciascuna voce sta **solo** nella casa del suo autore —
      // nel file, nel WAL, nella memoria condivisa.
      expect(tuttiIFile(aia)).toContain(diAnna);
      expect(tuttiIFile(aia)).not.toContain(diBruno);
      expect(tuttiIFile(borgo)).toContain(diBruno);
      expect(tuttiIFile(borgo)).not.toContain(diAnna);

      // E il testo in chiaro non è da nessuna parte.
      for (const c of [aia, borgo]) {
        expect(tuttiIFile(c)).not.toContain("segreto di");
      }
    });
  }, 60_000);

  it("con Borgo spenta restano chi e quando; riaccesa, il contenuto torna (ADR 0043, verifica 3)", async () => {
    await dueCase(async (aia, borgo, accese) => {
      const { sessioneAnna, sessioneBruno } = await conversazioneAperta(aia, borgo);
      await manda(
        borgo.ctx,
        sessioneBruno,
        { testo: "ci sono" },
        "m-bruno",
        "2026-09-23T18:00:00.000Z",
      );
      await leggi(aia.ctx, sessioneAnna);

      accese.delete(borgo.casa);
      const spenta = await leggi(aia.ctx, sessioneAnna);
      expect(spenta.nonRispondono).toEqual([borgo.casa]);
      expect(spenta.righe).toEqual([
        {
          createdAt: "2026-09-23T18:00:00.000Z",
          id: "m-bruno",
          mittente: `bruno@${borgo.casa}`,
          stato: "non-disponibile",
        },
      ]);

      accese.add(borgo.casa);
      const riaccesa = await leggi(aia.ctx, sessioneAnna);
      expect(riaccesa.righe.map((r) => [r.stato, r.testo])).toEqual([["letta", "ci sono"]]);
    });
  }, 60_000);

  it("Bruno ritira la sua parola: alla lettura dopo, per Anna non c'è più", async () => {
    await dueCase(async (aia, borgo) => {
      const { conv, sessioneAnna, sessioneBruno } = await conversazioneAperta(aia, borgo);
      await manda(
        borgo.ctx,
        sessioneBruno,
        { testo: "ci ripenso" },
        "m-bruno",
        "2026-09-23T18:00:00.000Z",
      );
      expect((await leggi(aia.ctx, sessioneAnna)).righe).toHaveLength(1);

      await chiama(
        borgo.app,
        borgo.token,
        "DELETE",
        `/api/v1/conversazioni/${conv}/archivio/m-bruno`,
      );

      expect((await leggi(aia.ctx, sessioneAnna)).righe).toEqual([]);
    });
  }, 60_000);

  it("con la casa che ordina spenta Bruno legge quello che c'è, e si dice perché la coda tace", async () => {
    await dueCase(async (aia, borgo, accese) => {
      const { sessioneBruno } = await conversazioneAperta(aia, borgo);

      // Aia ordina, e si spegne: la coda dei commit non si legge. Non è un
      // elenco vuoto — sarebbe «non è successo niente» — è la frase di §3.
      accese.delete(aia.casa);
      await expect(leggi(borgo.ctx, sessioneBruno)).rejects.toMatchObject({
        code: "casa_che_ordina_non_raggiungibile",
      });
    });
  }, 60_000);
});
