import { loadConfig, type AppConfig } from "@estia/config";
import type { ProfileSearchResult } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../app.js";

/**
 * La ricerca segue la modalità, e la cosa che decide non è quali risultati
 * escono: è **se la domanda esce di casa**.
 *
 * Fino al 2026-08-20 ogni ricerca partiva verso tutte le istanze collegate,
 * anche quella per trovare il vicino di sotto. Il termine che una persona
 * scrive è un dato suo, e non deve attraversare la rete perché qualcuno ha
 * lasciato un valore predefinito com'era.
 */

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

async function withMembri(
  use: (app: FastifyInstance, token: string) => Promise<void>,
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    await withClosable(app, async (instance) => {
      await instance.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      for (const username of ["anna", "annalisa"]) {
        await instance.identityService.createUser({
          password: "password-lunga-ok",
          role: "member",
          username,
        });
      }

      const token = (
        await instance.inject({
          method: "POST",
          payload: { password: ADMIN.password, username: ADMIN.username },
          url: "/api/v1/auth/login",
        })
      ).json().token as string;

      await use(instance, token);
    });
  });
}

function cerca(
  app: FastifyInstance,
  token: string,
  query: string,
): Promise<{ statusCode: number; json: () => ProfileSearchResult }> {
  return app.inject({
    headers: { authorization: `Bearer ${token}` },
    method: "GET",
    url: `/api/v1/profiles?${query}`,
  }) as unknown as Promise<{ statusCode: number; json: () => ProfileSearchResult }>;
}

describe("la ricerca e il suo ambito", () => {
  it("in casa non chiede niente a nessuno", async () => {
    await withMembri(async (app, token) => {
      const rete = vi.spyOn(app.federationService, "searchConnected");

      const risposta = await cerca(app, token, "q=anna&ambito=istanza");

      expect(risposta.json().locali.map((p) => p.username)).toEqual(["anna", "annalisa"]);
      expect(rete).not.toHaveBeenCalled();
    });
  });

  it("chi non dichiara l'ambito cerca in casa: niente esce per omissione", async () => {
    await withMembri(async (app, token) => {
      const rete = vi.spyOn(app.federationService, "searchConnected");

      await cerca(app, token, "q=anna");

      expect(rete).not.toHaveBeenCalled();
    });
  });

  it("nella rete la domanda parte, e con il termine scritto", async () => {
    await withMembri(async (app, token) => {
      const rete = vi.spyOn(app.federationService, "searchConnected");

      await cerca(app, token, "q=anna&ambito=rete");

      expect(rete).toHaveBeenCalledWith("anna");
    });
  });

  /**
   * Di sé si vede quello che vedrebbe un'altra istanza: è la promessa di
   * «presente e privato» — trovabile in casa, invisibile fuori — e qui la
   * stessa asimmetria vale per la ricerca fatta da un proprio membro.
   */
  it("nella rete compaiono solo i profili pubblici, anche quelli di casa", async () => {
    await withMembri(async (app, token) => {
      const anna = (
        await app.inject({
          method: "POST",
          payload: { password: "password-lunga-ok", username: "anna" },
          url: "/api/v1/auth/login",
        })
      ).json().token as string;

      await app.inject({
        headers: { authorization: `Bearer ${anna}` },
        method: "PUT",
        payload: { bio: "", openFollows: false, presence: "presente_privato" },
        url: "/api/v1/profile",
      });

      expect((await cerca(app, token, "q=anna&ambito=istanza")).json().locali).toHaveLength(2);
      expect((await cerca(app, token, "q=anna&ambito=rete")).json().locali).toEqual([]);
    });
  });

  it("rifiuta un ambito che non esiste invece di indovinarlo", async () => {
    await withMembri(async (app, token) => {
      expect((await cerca(app, token, "q=anna&ambito=ovunque")).statusCode).toBe(400);
    });
  });

  it("non cerca niente per una domanda vuota, in nessuno dei due ambiti", async () => {
    await withMembri(async (app, token) => {
      const rete = vi.spyOn(app.federationService, "searchConnected");

      expect((await cerca(app, token, "q=&ambito=rete")).json()).toEqual({
        locali: [],
        remoti: [],
      });
      expect(rete).not.toHaveBeenCalled();
    });
  });
});
