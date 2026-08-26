/**
 * Il `GroupInfo` lato istanza ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) punto 2).
 *
 * È il punto da cui un dispositivo nuovo riparte per rientrare in un gruppo MLS
 * senza che nessun altro sia online — lo spike
 * [S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md) ha misurato
 * che senza questo l'ingresso esterno non ha da dove cominciare.
 *
 * Tre proprietà, e sono tutte qui sotto: l'istanza **non guarda dentro**, il
 * diritto di leggerlo viene dall'essere membro della conversazione (non
 * dell'albero, che è ciò che si sta ricostruendo), e **l'epoch non torna
 * indietro**.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-group-info-test";
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
          name: "Casa GroupInfo",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      // Stessa via del resto dei test dei messaggi: i membri si creano dal
      // servizio, non passando dagli inviti, che qui non sono l'oggetto.
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
        dataDir,
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
  epoch: number,
  groupInfo: string,
) =>
  app.inject({
    headers: bearer(token),
    method: "PUT",
    payload: { epoch, groupInfo },
    url: `/api/v1/conversazioni/${id}/group-info`,
  });

const leggi = async (app: FastifyInstance, token: string, id: string) =>
  app.inject({
    headers: bearer(token),
    method: "GET",
    url: `/api/v1/conversazioni/${id}/group-info`,
  });

describe("il GroupInfo di una conversazione", () => {
  it("prima che qualcuno lo depositi, non c'è — e lo dice", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      const res = await leggi(app, annaToken, conversazioneId);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe("not_found");
    });
  });

  it("si deposita e si rilegge identico: l'istanza non lo tocca", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      const blob = "R1JPVVBJTkZPX09QQUNPX0JBU0U2NA==";
      const put = await deposita(app, annaToken, conversazioneId, 3, blob);
      expect(put.statusCode).toBe(200);
      expect(put.json().epoch).toBe(3);

      // Lo rilegge l'altro membro, che è il caso vero.
      const get = await leggi(app, brunoToken, conversazioneId);
      expect(get.statusCode).toBe(200);
      expect(get.json().groupInfo).toBe(blob);
      expect(get.json().epoch).toBe(3);
      expect(typeof get.json().updatedAt).toBe("string");
    });
  });

  it("l'epoch non torna indietro: un GroupInfo vecchio manderebbe chi rientra in un'epoch morta", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, 5, "EPOCH_5");

      const vecchio = await deposita(app, brunoToken, conversazioneId, 4, "EPOCH_4");
      expect(vecchio.statusCode).toBe(409);
      expect(vecchio.json().code).toBe("conflict");

      // e quello buono è rimasto
      expect((await leggi(app, annaToken, conversazioneId)).json().groupInfo).toBe("EPOCH_5");
    });
  });

  it("la stessa epoch si può riscrivere: due membri possono commettere insieme", async () => {
    await withRig(async ({ app, annaToken, brunoToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, 5, "DA_ANNA");
      const pari = await deposita(app, brunoToken, conversazioneId, 5, "DA_BRUNO");

      expect(pari.statusCode).toBe(200);
      expect((await leggi(app, annaToken, conversazioneId)).json().groupInfo).toBe("DA_BRUNO");
    });
  });

  it("avanzare di epoch sostituisce quello di prima", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, 1, "PRIMA");
      await deposita(app, annaToken, conversazioneId, 2, "DOPO");

      const letto = (await leggi(app, annaToken, conversazioneId)).json();
      expect(letto.groupInfo).toBe("DOPO");
      expect(letto.epoch).toBe(2);
    });
  });

  it("chi non è della conversazione non lo legge e non lo scrive", async () => {
    await withRig(async ({ app, annaToken, carlaToken, conversazioneId }) => {
      await deposita(app, annaToken, conversazioneId, 1, "SEGRETO");

      expect((await leggi(app, carlaToken, conversazioneId)).statusCode).toBe(403);
      expect((await deposita(app, carlaToken, conversazioneId, 9, "MIO")).statusCode).toBe(403);

      // e non ha cambiato niente
      expect((await leggi(app, annaToken, conversazioneId)).json().groupInfo).toBe("SEGRETO");
    });
  });

  it("senza sessione non si arriva né a leggerlo né a scriverlo", async () => {
    await withRig(async ({ app, conversazioneId }) => {
      const get = await app.inject({
        method: "GET",
        url: `/api/v1/conversazioni/${conversazioneId}/group-info`,
      });
      expect(get.statusCode).toBe(401);

      const put = await app.inject({
        method: "PUT",
        payload: { epoch: 1, groupInfo: "X" },
        url: `/api/v1/conversazioni/${conversazioneId}/group-info`,
      });
      expect(put.statusCode).toBe(401);
    });
  });

  it("un blob oltre il tetto viene rifiutato prima di toccare il disco", async () => {
    await withRig(async ({ app, annaToken, conversazioneId }) => {
      const enorme = "A".repeat(256 * 1024 + 1);
      const res = await deposita(app, annaToken, conversazioneId, 1, enorme);

      expect(res.statusCode).toBe(400);
      expect((await leggi(app, annaToken, conversazioneId)).statusCode).toBe(404);
    });
  });

  it("cancellata la conversazione, il suo GroupInfo se ne va con lei", async () => {
    await withRig(async ({ app, annaToken, conversazioneId, dataDir }) => {
      await deposita(app, annaToken, conversazioneId, 1, "RESTA_DA_SOLO?");

      await app.inject({
        headers: bearer(annaToken),
        method: "DELETE",
        url: `/api/v1/conversazioni/${conversazioneId}`,
      });

      // Guardato nel database, non dedotto dall'API: la riga non deve restare orfana.
      const db = readFileSync(path.join(dataDir, "estia.db"));
      expect(db.includes(Buffer.from("RESTA_DA_SOLO?"))).toBe(false);
    });
  });
});
