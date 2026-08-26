/**
 * Il registro delle chiavi di firma ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)).
 *
 * È ciò su cui poggia l'`AuthenticationService` di MLS, e lo spike
 * [S4](../../../../docs/spike/S4-autenticare-chi-entra.md) ha misurato che senza
 * di esso chiunque ottenga un `GroupInfo` entra come chi vuole.
 *
 * Tre proprietà da difendere: porta **solo** le chiavi, **non** porta le
 * revocate, e un nome che non esiste non insegna niente a chi chiede.
 */
import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-chiavi-firma-test";
const ADMIN = { password: "password-valida-admin", username: "admin" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

async function withRig(
  use: (rig: { app: FastifyInstance; annaToken: string; brunoToken: string }) => Promise<void>,
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Casa Chiavi",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const membro = async (username: string, chiave: string): Promise<string> => {
        const password = `password-lunga-${username}`;
        await app.identityService.createUser({ password, role: "member", username });
        const login = await app.identityService.login({ password, username });
        await app.inject({
          headers: bearer(login.token),
          method: "POST",
          payload: { algorithm: "ECDSA-P256", publicKey: chiave },
          url: "/api/v1/dispositivi/chiave",
        });
        return login.token;
      };

      await use({
        annaToken: await membro("anna", "CHIAVE_DI_ANNA"),
        app,
        brunoToken: await membro("bruno", "CHIAVE_DI_BRUNO"),
      });
    } finally {
      await app.close();
    }
  });
}

const chiavi = async (app: FastifyInstance, token: string, username: string) =>
  app.inject({
    headers: bearer(token),
    method: "GET",
    url: `/api/v1/dispositivi/di/${encodeURIComponent(username)}/chiavi`,
  });

describe("il registro delle chiavi di firma", () => {
  it("dice quali chiavi l'istanza riconosce per un membro", async () => {
    await withRig(async ({ app, annaToken }) => {
      const res = await chiavi(app, annaToken, "bruno");

      expect(res.statusCode).toBe(200);
      expect(res.json().chiavi).toHaveLength(1);
      expect(res.json().chiavi[0].publicKey).toBe("CHIAVE_DI_BRUNO");
      expect(res.json().chiavi[0].algorithm).toBe("ECDSA-P256");
    });
  });

  it("porta le chiavi e nient'altro: non l'id, non la sessione, non le date", async () => {
    // Per decidere se una credenziale è di quella persona serve la chiave. Il
    // resto sarebbe esposizione senza scopo.
    await withRig(async ({ app, annaToken }) => {
      const voce = (await chiavi(app, annaToken, "bruno")).json().chiavi[0] as Record<
        string,
        unknown
      >;

      expect(Object.keys(voce).sort()).toEqual(["algorithm", "publicKey"]);
    });
  });

  it("un nome che non esiste non insegna che quella persona non c'è", async () => {
    await withRig(async ({ app, annaToken }) => {
      const res = await chiavi(app, annaToken, "nessuno");

      expect(res.statusCode).toBe(200);
      expect(res.json().chiavi).toEqual([]);
    });
  });

  it("una chiave revocata non c'è più: altrimenti revocare sarebbe una parola", async () => {
    await withRig(async ({ app, annaToken, brunoToken }) => {
      expect((await chiavi(app, annaToken, "bruno")).json().chiavi).toHaveLength(1);

      // Bruno chiude la sessione: la chiave del dispositivo se ne va con lei.
      await app.inject({
        headers: bearer(brunoToken),
        method: "POST",
        url: "/api/v1/auth/logout",
      });

      expect((await chiavi(app, annaToken, "bruno")).json().chiavi).toEqual([]);
    });
  });

  it("più dispositivi della stessa persona, più chiavi", async () => {
    await withRig(async ({ app, annaToken }) => {
      // Un secondo accesso di Anna registra una chiave sua: MLS rifiuterebbe di
      // riusare la stessa, quindi il registro deve poterne portare più d'una.
      const secondo = await app.identityService.login({
        password: "password-lunga-anna",
        username: "anna",
      });
      await app.inject({
        headers: bearer(secondo.token),
        method: "POST",
        payload: { algorithm: "ECDSA-P256", publicKey: "CHIAVE_DEL_TABLET" },
        url: "/api/v1/dispositivi/chiave",
      });

      const lette = (await chiavi(app, annaToken, "anna")).json().chiavi as {
        publicKey: string;
      }[];

      expect(lette.map((c) => c.publicKey).sort()).toEqual(["CHIAVE_DEL_TABLET", "CHIAVE_DI_ANNA"]);
    });
  });

  it("senza sessione il registro non si legge", async () => {
    await withRig(async ({ app }) => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/di/bruno/chiavi",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
