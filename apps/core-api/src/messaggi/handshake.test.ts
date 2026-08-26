/**
 * Il canale di handshake MLS ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) punto 4).
 *
 * I messaggi applicativi vanno per la loro strada; commit e Welcome sono
 * un'altra cosa. Un **commit** deve raggiungere tutti i membri; un **Welcome**
 * soltanto chi viene aggiunto — e chi viene aggiunto non è ancora nel gruppo
 * crittografico, quindi non potrebbe decifrare niente che passi dal canale dei
 * membri. È questa asimmetria che i test qui sotto difendono.
 */
import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-handshake-test";
const ADMIN = { password: "password-valida-admin", username: "admin" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

interface Rig {
  app: FastifyInstance;
  annaToken: string;
  brunoToken: string;
  brunoId: string;
  carlaToken: string;
  conversazioneId: string;
}

async function withRig(use: (rig: Rig) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Casa Handshake",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const membro = async (username: string): Promise<{ token: string; id: string }> => {
        const password = `password-lunga-${username}`;
        const utente = await app.identityService.createUser({ password, role: "member", username });
        const login = await app.identityService.login({ password, username });
        await app.inject({
          headers: bearer(login.token),
          method: "POST",
          payload: { algorithm: "ECDSA-P256", publicKey: `pk_${username}` },
          url: "/api/v1/dispositivi/chiave",
        });
        return { id: utente.id, token: login.token };
      };

      const anna = await membro("anna");
      const bruno = await membro("bruno");
      const carla = await membro("carla");

      const conv = await app.inject({
        headers: bearer(anna.token),
        method: "POST",
        payload: { initialBusta: "BUSTA_INIZIALE", recipientUserId: bruno.id },
        url: "/api/v1/conversazioni",
      });

      await use({
        annaToken: anna.token,
        app,
        brunoId: bruno.id,
        brunoToken: bruno.token,
        carlaToken: carla.token,
        conversazioneId: conv.json().conversazione.id as string,
      });
    } finally {
      await app.close();
    }
  });
}

const deposita = async (
  app: FastifyInstance,
  token: string,
  id: string,
  body: Record<string, unknown>,
) =>
  app.inject({
    headers: bearer(token),
    method: "POST",
    payload: body,
    url: `/api/v1/conversazioni/${id}/handshake`,
  });

const leggi = async (app: FastifyInstance, token: string, id: string, query = "") =>
  app.inject({
    headers: bearer(token),
    method: "GET",
    url: `/api/v1/conversazioni/${id}/handshake${query}`,
  });

describe("il canale di handshake", () => {
  it("un commit raggiunge tutti i membri", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      const res = await deposita(app, annaToken, conversazioneId, {
        busta: "COMMIT_OPACO",
        epoch: 2,
        tipo: "commit",
      });
      expect(res.statusCode).toBe(200);

      for (const [chi, token] of [
        ["Anna", annaToken],
        ["Bruno", brunoToken],
      ] as const) {
        const pagina = (await leggi(app, token, conversazioneId)).json();
        expect({ chi, n: pagina.handshake.length }).toEqual({ chi, n: 1 });
        expect(pagina.handshake[0].busta).toBe("COMMIT_OPACO");
        expect(pagina.handshake[0].tipo).toBe("commit");
        expect(pagina.handshake[0].epoch).toBe(2);
      }
    });
  });

  it("un Welcome lo vede solo chi entra, non gli altri membri", async () => {
    await withRig(async ({ app, annaToken, brunoToken, brunoId, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, {
        busta: "WELCOME_PER_BRUNO",
        destinatario: brunoId,
        epoch: 1,
        tipo: "welcome",
      });

      const perBruno = (await leggi(app, brunoToken, conversazioneId)).json();
      expect(perBruno.handshake).toHaveLength(1);
      expect(perBruno.handshake[0].busta).toBe("WELCOME_PER_BRUNO");

      // Anna lo ha depositato, ma non è per lei: non deve vederlo.
      const perAnna = (await leggi(app, annaToken, conversazioneId)).json();
      expect(perAnna.handshake).toHaveLength(0);
    });
  });

  it("un Welcome senza destinatario è rifiutato: sarebbe un invito a nessuno", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      const res = await deposita(app, annaToken, conversazioneId, {
        busta: "WELCOME",
        epoch: 1,
        tipo: "welcome",
      });

      expect(res.statusCode).toBe(400);
      expect((await leggi(app, annaToken, conversazioneId)).json().handshake).toHaveLength(0);
    });
  });

  it("un commit con destinatario è rifiutato: sarebbe un gruppo spaccato in silenzio", async () => {
    await withRig(async ({ app, annaToken, brunoId, conversazioneId }) => {
      const res = await deposita(app, annaToken, conversazioneId, {
        busta: "COMMIT",
        destinatario: brunoId,
        epoch: 1,
        tipo: "commit",
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // Tre commit depositati di fila cadono nello stesso millisecondo. Un cursore
  // fatto di tempo li perderebbe; uno fatto di tempo + id li restituirebbe in
  // ordine di UUID, cioe' a caso. MLS applica i commit in sequenza, quindi
  // l'ordine dev'essere quello di ARRIVO — ed e' quello che questo test difende.
  it("si legge in ordine di arrivo, e si riparte da dove si era rimasti", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      for (const n of [1, 2, 3]) {
        await deposita(app, annaToken, conversazioneId, {
          busta: `COMMIT_${String(n)}`,
          epoch: n,
          tipo: "commit",
        });
      }

      const prima = (await leggi(app, brunoToken, conversazioneId, "?limit=2")).json();
      expect(prima.handshake.map((h: { epoch: number }) => h.epoch)).toEqual([1, 2]);
      expect(prima.prossimo).toBeDefined();

      const dopo = (
        await leggi(
          app,
          brunoToken,
          conversazioneId,
          `?dopo=${encodeURIComponent(prima.prossimo as string)}`,
        )
      ).json();
      expect(dopo.handshake.map((h: { epoch: number }) => h.epoch)).toEqual([3]);
      expect(dopo.prossimo).toBeUndefined();
    });
  });

  it("chi non è della conversazione non legge e non deposita", async () => {
    await withRig(async ({ app, annaToken, carlaToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, {
        busta: "COMMIT",
        epoch: 1,
        tipo: "commit",
      });

      expect((await leggi(app, carlaToken, conversazioneId)).statusCode).toBe(403);
      expect(
        (
          await deposita(app, carlaToken, conversazioneId, {
            busta: "MIO",
            epoch: 9,
            tipo: "commit",
          })
        ).statusCode,
      ).toBe(403);
    });
  });

  it("senza sessione non si arriva al canale", async () => {
    await withRig(async ({ app, conversazioneId }) => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/conversazioni/${conversazioneId}/handshake`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it("un handshake oltre il tetto è rifiutato prima di toccare il disco", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      const res = await deposita(app, annaToken, conversazioneId, {
        busta: "A".repeat(256 * 1024 + 1),
        epoch: 1,
        tipo: "commit",
      });

      expect(res.statusCode).toBe(400);
      expect((await leggi(app, annaToken, conversazioneId)).json().handshake).toHaveLength(0);
    });
  });

  it("un tipo che non esiste non entra", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      const res = await deposita(app, annaToken, conversazioneId, {
        busta: "X",
        epoch: 1,
        tipo: "proposta-inventata",
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
