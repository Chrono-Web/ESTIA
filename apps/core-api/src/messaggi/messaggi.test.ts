import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

      await use({
        app,
        dataDir,
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

/** Crea la conversazione di Alice con Bob, e ne restituisce l'id. */
async function conversazioneConBob(app: FastifyInstance, token: string, bobId: string) {
  const res = await app.inject({
    headers: bearer(token),
    method: "POST",
    payload: { recipientUserId: bobId },
    url: "/api/v1/conversazioni",
  });
  expect(res.statusCode).toBe(200);

  return res.json().conversazione as { id: string; tipo: string; membri: unknown[] };
}

describe("le conversazioni (M6)", () => {
  it("si crea una conversazione 1:1, e chi non ne fa parte non la vede", async () => {
    await withMessaggiRig(async ({ app, aliceToken, bobToken, bobId, luciaToken }) => {
      const conv = await conversazioneConBob(app, aliceToken, bobId);

      expect(conv.tipo).toBe("diretta");
      expect(conv.membri).toHaveLength(2);

      // Chiederla di nuovo restituisce la stessa: una coppia, una conversazione.
      expect((await conversazioneConBob(app, aliceToken, bobId)).id).toBe(conv.id);

      const bobList = await app.inject({
        headers: bearer(bobToken),
        method: "GET",
        url: "/api/v1/conversazioni",
      });
      expect(bobList.json().conversazioni.map((c: { id: string }) => c.id)).toEqual([conv.id]);

      const lucia = await app.inject({
        headers: bearer(luciaToken),
        method: "GET",
        url: `/api/v1/conversazioni/${conv.id}`,
      });
      expect(lucia.statusCode).toBe(403);
    });
  });

  it("i non letti contano le voci degli altri, e il segno di lettura li azzera", async () => {
    await withMessaggiRig(async ({ app, aliceToken, bobToken, bobId }) => {
      const conv = await conversazioneConBob(app, aliceToken, bobId);
      const scrittaIl = new Date().toISOString();

      // Alice scrive: la voce va nell'archivio della sua casa (ADR 0043). Il
      // contenuto è opaco per l'istanza, e qui basta che ci sia.
      const deposito = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { voci: [{ busta: "VOCE_OPACA", chiaveN: 1, createdAt: scrittaIl, id: "m1" }] },
        url: `/api/v1/conversazioni/${conv.id}/archivio`,
      });
      expect(deposito.statusCode).toBe(200);

      const nonLettiDi = async (token: string): Promise<number> => {
        const res = await app.inject({
          headers: bearer(token),
          method: "GET",
          url: "/api/v1/conversazioni",
        });
        return res.json().conversazioni[0].nonLetti as number;
      };

      expect(await nonLettiDi(bobToken)).toBe(1);
      expect(await nonLettiDi(aliceToken)).toBe(0);

      const visto = await app.inject({
        headers: bearer(bobToken),
        method: "POST",
        payload: { finoA: scrittaIl },
        url: `/api/v1/conversazioni/${conv.id}/visto`,
      });
      expect(visto.statusCode).toBe(200);
      expect(await nonLettiDi(bobToken)).toBe(0);

      // E Alice vede fin dove ha letto Bob: è un cursore di questa casa, e
      // arriva con la conversazione.
      const vistaDiAlice = await app.inject({
        headers: bearer(aliceToken),
        method: "GET",
        url: `/api/v1/conversazioni/${conv.id}`,
      });
      expect(vistaDiAlice.json().conversazione.peerVistoFinoA).toBe(scrittaIl);
    });
  });

  it("elimina un'intera conversazione, e solo chi ne fa parte", async () => {
    await withMessaggiRig(async ({ app, aliceToken, bobToken, bobId, luciaToken }) => {
      const conv = await conversazioneConBob(app, aliceToken, bobId);

      const luciaDelete = await app.inject({
        headers: bearer(luciaToken),
        method: "DELETE",
        url: `/api/v1/conversazioni/${conv.id}`,
      });
      expect(luciaDelete.statusCode).toBe(403);

      const aliceDelete = await app.inject({
        headers: bearer(aliceToken),
        method: "DELETE",
        url: `/api/v1/conversazioni/${conv.id}`,
      });
      expect(aliceDelete.statusCode).toBe(200);
      expect(aliceDelete.json()).toEqual({ ok: true });

      for (const token of [aliceToken, bobToken]) {
        const list = await app.inject({
          headers: bearer(token),
          method: "GET",
          url: "/api/v1/conversazioni",
        });
        expect(list.json().conversazioni).toHaveLength(0);
      }
    });
  });
});

/**
 * Il taglio netto di [ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)
 * punto 4, verifica 6: nessun percorso di `ESTIA-E2E-v1` resta aperto. Una
 * busta di trasporto depositata in casa d'altri sarebbe la copia che
 * [ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) vieta.
 */
describe("ESTIA-E2E-v1 si è ritirato", () => {
  it("le rotte delle buste non esistono più, e una busta iniziale non viene letta", async () => {
    await withMessaggiRig(async ({ app, aliceToken, bobId }) => {
      const conv = await conversazioneConBob(app, aliceToken, bobId);

      const leggi = await app.inject({
        headers: bearer(aliceToken),
        method: "GET",
        url: `/api/v1/conversazioni/${conv.id}/messaggi`,
      });
      expect(leggi.statusCode).toBe(404);

      const scrivi = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { busta: "BUSTA" },
        url: `/api/v1/conversazioni/${conv.id}/messaggi`,
      });
      expect(scrivi.statusCode).toBe(404);

      const conBusta = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { initialBusta: "BUSTA", recipientUserId: bobId },
        url: "/api/v1/conversazioni",
      });
      // Il campo non è più nello schema, e l'istanza lo scarta invece di
      // conservarlo: nessuna busta, nessun messaggio iniziale nella risposta.
      expect(conBusta.statusCode).toBe(200);
      expect(conBusta.json()).not.toHaveProperty("initialMessaggio");
      expect(conBusta.body).not.toContain("BUSTA");
    });
  });

  it("le tabelle delle buste e della loro coda non ci sono più", async () => {
    await withMessaggiRig(async ({ dataDir }) => {
      const db = new DatabaseSync(path.join(dataDir, "estia.db"), { readOnly: true });
      const tabelle = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all()
        .map((r) => (r as { name: string }).name);
      db.close();

      expect(tabelle).not.toContain("messaggi");
      expect(tabelle).not.toContain("messaggi_in_uscita");
    });
  });
});
