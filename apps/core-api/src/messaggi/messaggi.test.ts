import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-messaggi-test";
const ADMIN = { password: "password-valida-admin", username: "admin" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

interface TestRig {
  app: FastifyInstance;
  dataDir: string;
  adminToken: string;
  aliceToken: string;
  aliceId: string;
  bobToken: string;
  bobId: string;
  luciaToken: string;
  luciaId: string;
}

async function withMessaggiRig(use: (rig: TestRig) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Casa Messaggi",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const adminLogin = await app.identityService.login({
        password: ADMIN.password,
        username: ADMIN.username,
      });

      const alice = await app.identityService.createUser({
        password: "password-lunga-alice",
        role: "member",
        username: "alice",
      });
      const aliceLogin = await app.identityService.login({
        password: "password-lunga-alice",
        username: "alice",
      });

      const bob = await app.identityService.createUser({
        password: "password-lunga-bob",
        role: "member",
        username: "bob",
      });
      const bobLogin = await app.identityService.login({
        password: "password-lunga-bob",
        username: "bob",
      });

      const lucia = await app.identityService.createUser({
        password: "password-lunga-lucia",
        role: "member",
        username: "lucia",
      });
      const luciaLogin = await app.identityService.login({
        password: "password-lunga-lucia",
        username: "lucia",
      });

      // Registra device keys per Alice e Bob
      await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/chiave",
        headers: bearer(aliceLogin.token),
        payload: { publicKey: "pk_alice", algorithm: "ECDSA-P256" },
      });

      await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/chiave",
        headers: bearer(bobLogin.token),
        payload: { publicKey: "pk_bob", algorithm: "ECDSA-P256" },
      });

      await use({
        app,
        dataDir,
        adminToken: adminLogin.token,
        aliceToken: aliceLogin.token,
        aliceId: alice.id,
        bobToken: bobLogin.token,
        bobId: bob.id,
        luciaToken: luciaLogin.token,
        luciaId: lucia.id,
      });
    } finally {
      await app.close();
    }
  });
}

describe("messaggi privati E2E (M6 Fase 2)", () => {
  it("crea una conversazione 1:1 e scambia buste cifrate", async () => {
    await withMessaggiRig(async ({ app, aliceToken, bobToken, bobId, luciaToken }) => {
      // Alice avvia una conversazione con Bob
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/conversazioni",
        headers: bearer(aliceToken),
        payload: {
          recipientUserId: bobId,
          initialBusta: "BUSTA_CIFRATA_INIT_BASE64",
        },
      });

      expect(createRes.statusCode).toBe(200);
      const conv = createRes.json().conversazione;
      expect(conv.id).toBeDefined();
      expect(conv.tipo).toBe("diretta");
      expect(conv.membri).toHaveLength(2);
      expect(createRes.json().initialMessaggio.busta).toBe("BUSTA_CIFRATA_INIT_BASE64");

      // Bob legge la lista delle conversazioni
      const bobListRes = await app.inject({
        method: "GET",
        url: "/api/v1/conversazioni",
        headers: bearer(bobToken),
      });
      expect(bobListRes.statusCode).toBe(200);
      const bobConvs = bobListRes.json().conversazioni;
      expect(bobConvs).toHaveLength(1);
      expect(bobConvs[0].id).toBe(conv.id);
      expect(bobConvs[0].nonLetti).toBe(1);

      // Bob risponde nella conversazione
      const sendRes = await app.inject({
        method: "POST",
        url: `/api/v1/conversazioni/${conv.id}/messaggi`,
        headers: bearer(bobToken),
        payload: {
          busta: "BUSTA_CIFRATA_RISPOSTA_BOB",
        },
      });
      expect(sendRes.statusCode).toBe(200);
      expect(sendRes.json().messaggio.busta).toBe("BUSTA_CIFRATA_RISPOSTA_BOB");

      // Bob segna come letto
      const vistoRes = await app.inject({
        method: "POST",
        url: `/api/v1/conversazioni/${conv.id}/visto`,
        headers: bearer(bobToken),
        payload: {
          finoA: new Date().toISOString(),
        },
      });
      expect(vistoRes.statusCode).toBe(200);

      // Ora i non letti di Bob sono 0
      const bobListAfter = await app.inject({
        method: "GET",
        url: "/api/v1/conversazioni",
        headers: bearer(bobToken),
      });
      expect(bobListAfter.json().conversazioni[0].nonLetti).toBe(0);

      // Alice legge i messaggi della conversazione
      const msgsRes = await app.inject({
        method: "GET",
        url: `/api/v1/conversazioni/${conv.id}/messaggi`,
        headers: bearer(aliceToken),
      });
      expect(msgsRes.statusCode).toBe(200);
      const msgs = msgsRes.json().messaggi;
      expect(msgs).toHaveLength(2);
      expect(msgs[0].busta).toBe("BUSTA_CIFRATA_INIT_BASE64");
      expect(msgs[1].busta).toBe("BUSTA_CIFRATA_RISPOSTA_BOB");

      // Lucia (non membro) tenta di leggere i messaggi: 403 Forbidden
      const luciaRes = await app.inject({
        method: "GET",
        url: `/api/v1/conversazioni/${conv.id}/messaggi`,
        headers: bearer(luciaToken),
      });
      expect(luciaRes.statusCode).toBe(403);
    });
  });

  it("BLINDATURA ADR 0006: il testo in chiaro non compare mai nel database", async () => {
    await withMessaggiRig(async ({ app, dataDir, aliceToken, bobId }) => {
      const TESTO_SEGRETO = "QUESTO_E_UN_MESSAGGIO_SEGRETO_DI_ALICE_PER_BOB_12345";

      // Simuliamo la cifratura lato client: il client trasforma il testo in una busta cifrata opaca
      const bustaCifrataFittizia = Buffer.from("CIFRATO_IV_TAG_CIPHERTEXT_XYZ987").toString(
        "base64",
      );

      // Alice invia il messaggio
      await app.inject({
        method: "POST",
        url: "/api/v1/conversazioni",
        headers: bearer(aliceToken),
        payload: {
          recipientUserId: bobId,
          initialBusta: bustaCifrataFittizia,
        },
      });

      // Scansioniamo il file di database SQLite grezzo su disco
      const dbPath = path.join(dataDir, "estia.db");
      const dbBytes = readFileSync(dbPath);
      const dbContentString = dbBytes.toString("utf8");

      // La stringa del testo in chiaro NON deve esistere in nessun punto del file del database
      expect(dbContentString).not.toContain(TESTO_SEGRETO);
    });
  });

  it("elimina un'intera conversazione e tutti i relativi messaggi", async () => {
    await withMessaggiRig(async ({ app, aliceToken, bobToken, bobId, luciaToken }) => {
      // Alice avvia la conversazione
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/conversazioni",
        headers: bearer(aliceToken),
        payload: {
          recipientUserId: bobId,
          initialBusta: "BUSTA_DA_ELIMINARE",
        },
      });
      const convId = createRes.json().conversazione.id;

      // Lucia (non membro) tenta di eliminarla: 403 Forbidden
      const luciaDelete = await app.inject({
        method: "DELETE",
        url: `/api/v1/conversazioni/${convId}`,
        headers: bearer(luciaToken),
      });
      expect(luciaDelete.statusCode).toBe(403);

      // Alice (membro) elimina la conversazione
      const aliceDelete = await app.inject({
        method: "DELETE",
        url: `/api/v1/conversazioni/${convId}`,
        headers: bearer(aliceToken),
      });
      expect(aliceDelete.statusCode).toBe(200);
      expect(aliceDelete.json()).toEqual({ ok: true });

      // Ora la lista delle conversazioni per Alice e Bob è vuota
      const aliceList = await app.inject({
        method: "GET",
        url: "/api/v1/conversazioni",
        headers: bearer(aliceToken),
      });
      expect(aliceList.json().conversazioni).toHaveLength(0);

      const bobList = await app.inject({
        method: "GET",
        url: "/api/v1/conversazioni",
        headers: bearer(bobToken),
      });
      expect(bobList.json().conversazioni).toHaveLength(0);
    });
  });

  it("supporta conversazioni con membri remoti e popola la coda messaggi in uscita", async () => {
    await withMessaggiRig(async ({ app, aliceToken }) => {
      const CHIAVE_REMOTA = "chiave-istanza-remota-12345";
      const USER_REMOTO = "marco";

      // Alice avvia una conversazione con un utente remoto
      const createRes = await app.inject({
        method: "POST",
        url: "/api/v1/conversazioni",
        headers: bearer(aliceToken),
        payload: {
          recipientUsername: USER_REMOTO,
          remoteInstanceKey: CHIAVE_REMOTA,
          initialBusta: "BUSTA_CIFRATA_PER_MARCO",
        },
      });

      expect(createRes.statusCode).toBe(200);
      const conv = createRes.json().conversazione;
      expect(conv.membri).toContainEqual(
        expect.objectContaining({
          id: `remote:${CHIAVE_REMOTA}:${USER_REMOTO}`,
          username: USER_REMOTO,
        }),
      );

      // Verifichiamo che la coda dei messaggi in uscita contenga la busta
      const pendingOutbox = app.messaggiService?.listMessaggiInUscita(10);
      expect(pendingOutbox).toBeDefined();
      expect(pendingOutbox?.some((m) => m.destinatarioChiave === CHIAVE_REMOTA)).toBe(true);
    });
  });

  it("riceve e consegna una busta da un'istanza remota per un utente locale", async () => {
    await withMessaggiRig(async ({ app, aliceToken }) => {
      const CHIAVE_MITTENTE = "chiave-remota-genova";
      const MITTENTE_USER = "elena";

      const esito = app.messaggiService.consegnaBustaRemota({
        busta: "BUSTA_CIFRATA_ARRIVATA_DA_ELENA",
        conversazioneId: "conv-federata-1",
        createdAt: new Date().toISOString(),
        destinatarioUsername: "alice",
        messaggioId: "msg-remoto-1",
        senderDeviceId: "device-elena-1",
        senderRemoteKey: CHIAVE_MITTENTE,
        senderUsername: MITTENTE_USER,
      });

      expect(esito).toBeDefined();
      expect(esito?.consegnatoAt).toBeDefined();

      // Alice legge i propri messaggi e trova la conversazione e la busta
      const convListRes = await app.inject({
        method: "GET",
        url: "/api/v1/conversazioni",
        headers: bearer(aliceToken),
      });

      expect(convListRes.statusCode).toBe(200);
      const convs = convListRes.json().conversazioni;
      expect(convs).toHaveLength(1);
      expect(convs[0].membri).toContainEqual(
        expect.objectContaining({
          id: `remote:${CHIAVE_MITTENTE}:${MITTENTE_USER}`,
          username: MITTENTE_USER,
        }),
      );

      const msgsRes = await app.inject({
        method: "GET",
        url: `/api/v1/conversazioni/${convs[0].id}/messaggi`,
        headers: bearer(aliceToken),
      });

      expect(msgsRes.statusCode).toBe(200);
      const msgs = msgsRes.json().messaggi;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].busta).toBe("BUSTA_CIFRATA_ARRIVATA_DA_ELENA");
      expect(msgs[0].senderUserId).toBe(`remote:${CHIAVE_MITTENTE}:${MITTENTE_USER}`);
    });
  });
});
