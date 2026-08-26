/**
 * L'archivio di una conversazione ([ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md),
 * punto 3 di [ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)).
 *
 * Il trasporto ha la forward secrecy e distrugge le chiavi vecchie; la
 * cronologia sopravvive perché il client, dopo aver decifrato, ricifra il testo
 * con una chiave d'archivio e deposita quello. Per l'istanza sono blob opachi,
 * come le buste: due garanzie diverse, stesso silenzio.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-archivio-test";
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
  dataDir: string;
  annaToken: string;
  brunoToken: string;
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
          name: "Casa Archivio",
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
        brunoToken: bruno.token,
        carlaToken: carla.token,
        conversazioneId: conv.json().conversazione.id as string,
        dataDir,
      });
    } finally {
      await app.close();
    }
  });
}

const voce = (id: string, chiaveN: number, busta: string, createdAt: string) => ({
  busta,
  chiaveN,
  createdAt,
  id,
});

const deposita = async (
  app: FastifyInstance,
  token: string,
  id: string,
  voci: ReturnType<typeof voce>[],
) =>
  app.inject({
    headers: bearer(token),
    method: "POST",
    payload: { voci },
    url: `/api/v1/conversazioni/${id}/archivio`,
  });

const leggi = async (app: FastifyInstance, token: string, id: string, query = "") =>
  app.inject({
    headers: bearer(token),
    method: "GET",
    url: `/api/v1/conversazioni/${id}/archivio${query}`,
  });

describe("il mazzo delle chiavi d'archivio", () => {
  const mettiMazzo = async (
    app: FastifyInstance,
    token: string,
    id: string,
    epoch: number,
    mazzo: string,
  ) =>
    app.inject({
      headers: bearer(token),
      method: "PUT",
      payload: { epoch, mazzo },
      url: `/api/v1/conversazioni/${id}/archivio/chiavi`,
    });

  const leggiMazzo = async (app: FastifyInstance, token: string, id: string) =>
    app.inject({
      headers: bearer(token),
      method: "GET",
      url: `/api/v1/conversazioni/${id}/archivio/chiavi`,
    });

  it("si deposita e si rilegge identico: l'istanza non sa aprirlo", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      const mazzo = "TUFaWk9fQVZWT0xUTw==";
      expect((await mettiMazzo(app, annaToken, conversazioneId, 2, mazzo)).statusCode).toBe(200);

      const letto = await leggiMazzo(app, brunoToken, conversazioneId);
      expect(letto.statusCode).toBe(200);
      expect(letto.json().mazzo).toBe(mazzo);
      expect(letto.json().epoch).toBe(2);
    });
  });

  it("l'epoch non torna indietro, come per il GroupInfo", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      await mettiMazzo(app, annaToken, conversazioneId, 7, "EPOCH_7");

      expect((await mettiMazzo(app, brunoToken, conversazioneId, 6, "EPOCH_6")).statusCode).toBe(
        409,
      );
      expect((await leggiMazzo(app, annaToken, conversazioneId)).json().mazzo).toBe("EPOCH_7");
    });
  });

  it("chi non è della conversazione non lo tocca", async () => {
    await withRig(async ({ app, annaToken, carlaToken, conversazioneId }) => {
      await mettiMazzo(app, annaToken, conversazioneId, 1, "MIO");

      expect((await leggiMazzo(app, carlaToken, conversazioneId)).statusCode).toBe(403);
      expect((await mettiMazzo(app, carlaToken, conversazioneId, 9, "SUO")).statusCode).toBe(403);
    });
  });
});

describe("le voci d'archivio", () => {
  it("si depositano e si rileggono in ordine di tempo, dalla più vecchia", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      const res = await deposita(app, annaToken, conversazioneId, [
        voce("m2", 1, "SECONDA", "2026-08-26T10:01:00.000Z"),
        voce("m1", 1, "PRIMA", "2026-08-26T10:00:00.000Z"),
        voce("m3", 2, "TERZA", "2026-08-26T10:02:00.000Z"),
      ]);
      expect(res.statusCode).toBe(200);
      expect(res.json().scritte).toBe(3);

      // La rilegge l'altro membro, che è il caso vero.
      const pagina = (await leggi(app, brunoToken, conversazioneId)).json();
      expect(pagina.voci.map((v: { id: string }) => v.id)).toEqual(["m1", "m2", "m3"]);
      expect(pagina.voci[0].busta).toBe("PRIMA");
      expect(pagina.voci[2].chiaveN).toBe(2);
    });
  });

  it("depositare due volte la stessa voce non duplica e non è un errore", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      const stessa = [voce("m1", 1, "UNA", "2026-08-26T10:00:00.000Z")];

      expect((await deposita(app, annaToken, conversazioneId, stessa)).json().scritte).toBe(1);
      // Bruno archivia la stessa conversazione dal suo dispositivo, senza coordinarsi.
      const secondo = await deposita(app, brunoToken, conversazioneId, stessa);
      expect(secondo.statusCode).toBe(200);
      expect(secondo.json().scritte).toBe(0);

      expect((await leggi(app, annaToken, conversazioneId)).json().voci).toHaveLength(1);
    });
  });

  it("un deposito misto scrive solo le voci nuove", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, [
        voce("m1", 1, "UNA", "2026-08-26T10:00:00.000Z"),
      ]);

      const misto = await deposita(app, annaToken, conversazioneId, [
        voce("m1", 1, "UNA", "2026-08-26T10:00:00.000Z"),
        voce("m2", 1, "DUE", "2026-08-26T10:01:00.000Z"),
      ]);

      expect(misto.json().scritte).toBe(1);
      expect((await leggi(app, annaToken, conversazioneId)).json().voci).toHaveLength(2);
    });
  });

  it("si pagina, e la pagina dice da dove ripartire", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      await deposita(
        app,
        annaToken,
        conversazioneId,
        Array.from({ length: 5 }, (_, i) =>
          voce(`m${String(i)}`, 1, `B${String(i)}`, `2026-08-26T10:0${String(i)}:00.000Z`),
        ),
      );

      const prima = (await leggi(app, annaToken, conversazioneId, "?limit=2")).json();
      expect(prima.voci.map((v: { id: string }) => v.id)).toEqual(["m0", "m1"]);
      expect(prima.prossimo).toBe("2026-08-26T10:01:00.000Z");

      const dopo = (
        await leggi(
          app,
          annaToken,
          conversazioneId,
          `?limit=2&dopo=${encodeURIComponent(prima.prossimo as string)}`,
        )
      ).json();
      expect(dopo.voci.map((v: { id: string }) => v.id)).toEqual(["m2", "m3"]);
    });
  });

  it("l'ultima pagina non promette che ce ne sia un'altra", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, [
        voce("m1", 1, "UNA", "2026-08-26T10:00:00.000Z"),
      ]);

      const pagina = (await leggi(app, annaToken, conversazioneId, "?limit=10")).json();
      expect(pagina.voci).toHaveLength(1);
      expect(pagina.prossimo).toBeUndefined();
    });
  });

  it("chi non è della conversazione non legge e non deposita", async () => {
    await withRig(async ({ app, annaToken, carlaToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, [
        voce("m1", 1, "SEGRETO", "2026-08-26T10:00:00.000Z"),
      ]);

      expect((await leggi(app, carlaToken, conversazioneId)).statusCode).toBe(403);
      expect(
        (
          await deposita(app, carlaToken, conversazioneId, [
            voce("x", 1, "MIO", "2026-08-26T11:00:00.000Z"),
          ])
        ).statusCode,
      ).toBe(403);

      expect((await leggi(app, annaToken, conversazioneId)).json().voci).toHaveLength(1);
    });
  });

  it("senza sessione non si arriva all'archivio", async () => {
    await withRig(async ({ app, conversazioneId }) => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/conversazioni/${conversazioneId}/archivio`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it("un deposito troppo grosso viene rifiutato prima di toccare il disco", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      const troppe = Array.from({ length: 201 }, (_, i) =>
        voce(`m${String(i)}`, 1, "B", "2026-08-26T10:00:00.000Z"),
      );
      expect((await deposita(app, annaToken, conversazioneId, troppe)).statusCode).toBe(400);

      const enorme = [voce("m1", 1, "A".repeat(65537), "2026-08-26T10:00:00.000Z")];
      expect((await deposita(app, annaToken, conversazioneId, enorme)).statusCode).toBe(400);

      expect((await leggi(app, annaToken, conversazioneId)).json().voci).toHaveLength(0);
    });
  });

  it("cancellata la conversazione, l'archivio se ne va con lei", async () => {
    await withRig(async ({ app, annaToken, conversazioneId, dataDir }) => {
      await deposita(app, annaToken, conversazioneId, [
        voce("m1", 1, "RESTA_DA_SOLO?", "2026-08-26T10:00:00.000Z"),
      ]);

      await app.inject({
        headers: bearer(annaToken),
        method: "DELETE",
        url: `/api/v1/conversazioni/${conversazioneId}`,
      });

      // Guardato nel database, non dedotto dall'API.
      const db = readFileSync(path.join(dataDir, "estia.db"));
      expect(db.includes(Buffer.from("RESTA_DA_SOLO?"))).toBe(false);
    });
  });
});
