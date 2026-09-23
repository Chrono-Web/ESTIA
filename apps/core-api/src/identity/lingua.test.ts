/**
 * La lingua della persona e quella dell'istanza (ADR 0044 §3), e l'errore che
 * porta i propri parametri al client (§5).
 */
import { loadConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "admin" };

async function withApp(
  use: (context: { app: FastifyInstance; token: string }) => Promise<void>,
  setup: Record<string, string> = {},
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(
      loadConfig({ ESTIA_DATA_DIR: dataDir, ESTIA_HOST: "127.0.0.1", ESTIA_LOG_LEVEL: "silent" }),
      { setupToken: SETUP_TOKEN },
    );

    try {
      const configured = await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
          ...setup,
        },
        url: "/api/v1/instance/setup",
      });

      expect(configured.statusCode).toBe(201);

      const login = await app.inject({
        method: "POST",
        payload: { password: ADMIN.password, username: ADMIN.username },
        url: "/api/v1/auth/login",
      });

      await use({ app, token: login.json().token as string });
    } finally {
      await app.close();
    }
  });
}

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

describe("la lingua della persona", () => {
  it("è automatica finché la persona non ne sceglie una", async () => {
    await withApp(async ({ app, token }) => {
      const me = await app.inject({ headers: bearer(token), url: "/api/v1/auth/me" });

      expect(me.json().language).toBe("auto");
    });
  });

  it("si sceglie, si ritrova, e torna automatica", async () => {
    await withApp(async ({ app, token }) => {
      const scelta = await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: { language: "en" },
        url: "/api/v1/me/language",
      });

      expect(scelta.json()).toEqual({ language: "en" });

      const me = await app.inject({ headers: bearer(token), url: "/api/v1/auth/me" });

      expect(me.json().language).toBe("en");

      const automatica = await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: { language: "auto" },
        url: "/api/v1/me/language",
      });

      expect(automatica.json()).toEqual({ language: "auto" });
    });
  });

  it("non lascia scegliere una lingua che ESTIA non ha, e dice quale col codice", async () => {
    await withApp(async ({ app, token }) => {
      const rifiuto = await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: { language: "tlh" },
        url: "/api/v1/me/language",
      });

      expect(rifiuto.statusCode).toBe(400);
      expect(rifiuto.json()).toMatchObject({
        code: "unknown_language",
        params: { language: "tlh" },
      });
    });
  });

  it("non tocca l'aspetto già scelto", async () => {
    await withApp(async ({ app, token }) => {
      const aspetto = { aspetto: "scuro", contrasto: "alto", palette: "neutro" };

      await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: aspetto,
        url: "/api/v1/me/appearance",
      });
      await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: { language: "en" },
        url: "/api/v1/me/language",
      });

      const me = await app.inject({ headers: bearer(token), url: "/api/v1/auth/me" });

      expect(me.json().appearance).toEqual(aspetto);
    });
  });
});

describe("la lingua dell'istanza", () => {
  it("è quella scelta alla configurazione, e si vede prima dell'accesso", async () => {
    await withApp(
      async ({ app }) => {
        const vetrina = await app.inject({ url: "/api/v1/instance" });

        expect(vetrina.json().defaultLanguage).toBe("en");
      },
      { language: "en" },
    );
  });

  it("è l'italiano quando la configurazione non la dice", async () => {
    await withApp(async ({ app }) => {
      const vetrina = await app.inject({ url: "/api/v1/instance" });

      expect(vetrina.json().defaultLanguage).toBe("it");
    });
  });

  it("la cambia chi amministra, e solo con una lingua che esiste", async () => {
    await withApp(async ({ app, token }) => {
      const cambio = await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: { language: "en" },
        url: "/api/v1/admin/instance/language",
      });

      expect(cambio.statusCode).toBe(200);
      expect(cambio.json().defaultLanguage).toBe("en");

      const automatica = await app.inject({
        headers: bearer(token),
        method: "PUT",
        payload: { language: "auto" },
        url: "/api/v1/admin/instance/language",
      });

      expect(automatica.statusCode).toBe(400);
    });
  });

  it("non la cambia chi non amministra", async () => {
    await withApp(async ({ app }) => {
      const anonimo = await app.inject({
        method: "PUT",
        payload: { language: "en" },
        url: "/api/v1/admin/instance/language",
      });

      expect(anonimo.statusCode).toBe(401);
    });
  });
});
