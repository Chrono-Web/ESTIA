import { loadConfig, type AppConfig } from "@estia/config";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadOrCreateIdentity } from "./instance/identity.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN_PASSWORD = "una-password-lunga";

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

async function withApp(use: (app: FastifyInstance) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), {
      setupToken: SETUP_TOKEN,
    });
    await withClosable(app, use);
  });
}

describe("core API health endpoints", () => {
  it("returns a successful liveness response without listening on a TCP port", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/health/live" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  it("returns a successful readiness response without listening on a TCP port", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/health/ready" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  it("publishes the routes in the generated OpenAPI document", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/openapi.json" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        openapi: "3.0.3",
        paths: {
          "/api/v1/instance": expect.any(Object),
          "/health/live": expect.any(Object),
          "/health/ready": expect.any(Object),
        },
      });
    });
  });
});

describe("instance setup", () => {
  it("reports an unconfigured instance that already has an identity", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v1/instance" });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.state).toBe("unconfigured");
      expect(body.name).toBeUndefined();
      // The keypair exists from the first boot, before any configuration.
      expect(body.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  /**
   * La verifica del solo codice, che la configurazione a passi usa per dirlo
   * subito invece che dopo sei campi compilati. Non concede niente: le tre
   * prove qui sotto sono le tre proprietà che deve avere.
   */
  it("dice subito se il codice di configurazione è quello giusto", async () => {
    await withApp(async (app) => {
      const giusto = await app.inject({
        method: "POST",
        payload: { setupToken: SETUP_TOKEN },
        url: "/api/v1/instance/setup/verify",
      });

      expect(giusto.statusCode).toBe(204);

      const sbagliato = await app.inject({
        method: "POST",
        payload: { setupToken: "sbagliato" },
        url: "/api/v1/instance/setup/verify",
      });

      expect(sbagliato.statusCode).toBe(403);
      expect(sbagliato.json().code).toBe("invalid_setup_token");
    });
  });

  it("verificare il codice non configura niente", async () => {
    await withApp(async (app) => {
      await app.inject({
        method: "POST",
        payload: { setupToken: SETUP_TOKEN },
        url: "/api/v1/instance/setup/verify",
      });

      expect((await app.inject({ method: "GET", url: "/api/v1/instance" })).json().state).toBe(
        "unconfigured",
      );
    });
  });

  it("non verifica più niente su un'istanza già configurata", async () => {
    await withApp(async (app) => {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN_PASSWORD,
          adminUsername: "admin",
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const dopo = await app.inject({
        method: "POST",
        payload: { setupToken: SETUP_TOKEN },
        url: "/api/v1/instance/setup/verify",
      });

      expect(dopo.statusCode).toBe(409);
      expect(dopo.json().code).toBe("instance_already_configured");
    });
  });

  it("refuses setup without the correct token", async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "POST",
        payload: {
          name: "Quartiere",
          adminPassword: ADMIN_PASSWORD,
          adminUsername: "admin",
          setupToken: "sbagliato",
        },
        url: "/api/v1/instance/setup",
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("invalid_setup_token");

      const after = await app.inject({ method: "GET", url: "/api/v1/instance" });
      expect(after.json().state).toBe("unconfigured");
    });
  });

  it("configures the instance and keeps its identity", async () => {
    await withApp(async (app) => {
      const before = await app.inject({ method: "GET", url: "/api/v1/instance" });

      const response = await app.inject({
        method: "POST",
        payload: {
          description: "Il feed di via Roma",
          name: "Via Roma",
          adminPassword: ADMIN_PASSWORD,
          adminUsername: "admin",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.instance.state).toBe("configured");
      expect(body.instance.name).toBe("Via Roma");
      expect(body.instance.publicKey).toBe(before.json().publicKey);
      // Shown once, never retrievable again (ADR 0009).
      expect(body.recoveryCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);

      const after = await app.inject({ method: "GET", url: "/api/v1/instance" });
      expect(after.json()).toMatchObject({ name: "Via Roma", state: "configured" });
    });
  });

  it("refuses a second setup", async () => {
    await withApp(async (app) => {
      const payload = {
        name: "Via Roma",
        adminPassword: ADMIN_PASSWORD,
        adminUsername: "admin",
        setupToken: SETUP_TOKEN,
      };

      const first = await app.inject({
        method: "POST",
        payload,
        url: "/api/v1/instance/setup",
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        payload: {
          name: "Dirottamento",
          adminPassword: ADMIN_PASSWORD,
          adminUsername: "admin",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      expect(second.statusCode).toBe(409);
      expect(second.json().code).toBe("instance_already_configured");

      const after = await app.inject({ method: "GET", url: "/api/v1/instance" });
      expect(after.json().name).toBe("Via Roma");
    });
  });

  it("never echoes the setup token back to the caller", async () => {
    await withApp(async (app) => {
      const rejected = await app.inject({
        method: "POST",
        payload: {
          name: "Quartiere",
          adminPassword: ADMIN_PASSWORD,
          adminUsername: "admin",
          setupToken: "sbagliato",
        },
        url: "/api/v1/instance/setup",
      });

      const accepted = await app.inject({
        method: "POST",
        payload: {
          name: "Quartiere",
          adminPassword: ADMIN_PASSWORD,
          adminUsername: "admin",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      expect(rejected.body).not.toContain(SETUP_TOKEN);
      expect(accepted.body).not.toContain(SETUP_TOKEN);
    });
  });

  it("never exposes the instance private key through the API", async () => {
    await withTempDataDir(async (dataDir) => {
      const privateKeyPem = loadOrCreateIdentity(dataDir).privateKeyPem;
      const app = await buildApp(configFor(dataDir), {
        setupToken: SETUP_TOKEN,
      });

      await withClosable(app, async (instance) => {
        await instance.inject({
          method: "POST",
          payload: {
            name: "Via Roma",
            adminPassword: ADMIN_PASSWORD,
            adminUsername: "admin",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });

        for (const url of ["/api/v1/instance", "/openapi.json"]) {
          const response = await instance.inject({ method: "GET", url });

          expect(response.body).not.toContain(privateKeyPem);
          expect(response.body).not.toContain("PRIVATE KEY");
        }
      });
    });
  });

  it("survives a restart with the same identity and configuration", async () => {
    await withTempDataDir(async (dataDir) => {
      const first = await buildApp(configFor(dataDir), {
        setupToken: SETUP_TOKEN,
      });
      let publicKey: string;

      try {
        const created = await first.inject({
          method: "POST",
          payload: {
            name: "Via Roma",
            adminPassword: ADMIN_PASSWORD,
            adminUsername: "admin",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });
        publicKey = created.json().instance.publicKey;
      } finally {
        await first.close();
      }

      const second = await buildApp(configFor(dataDir), {
        setupToken: SETUP_TOKEN,
      });

      await withClosable(second, async (app) => {
        const view = await app.inject({ method: "GET", url: "/api/v1/instance" });

        expect(view.json()).toMatchObject({ name: "Via Roma", publicKey, state: "configured" });
      });
    });
  });
});

/**
 * SECURITY_BASELINE §2 is explicit that a home network is not a trusted one: a
 * compromised television on the same LAN is an attacker. A route left without a
 * limit because nobody remembered is a route that attacker gets for free.
 */
describe("the rate limit that covers everything", () => {
  it("puts a ceiling on a route that never asked for one", async () => {
    await withApp(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v1/instance" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-ratelimit-limit"]).toBe("600");
    });
  });

  /** The tighter numbers were chosen deliberately and must keep winning. */
  it("leaves a route with its own, stricter limit alone", async () => {
    await withApp(async (app) => {
      const response = await app.inject({
        method: "POST",
        payload: { password: "sbagliata", username: "nessuno" },
        url: "/api/v1/auth/login",
      });

      expect(response.headers["x-ratelimit-limit"]).toBe("10");
    });
  });

  /**
   * Liveness must not depend on the limiter: a health check that starts failing
   * gets the container restarted, which would turn a burst into an outage.
   */
  it("never counts the health checks", async () => {
    await withApp(async (app) => {
      for (const url of ["/health/live", "/health/ready"]) {
        const response = await app.inject({ method: "GET", url });

        expect(response.statusCode).toBe(200);
        expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
      }
    });
  });

  it("answers a refused request in the documented error shape", async () => {
    await withApp(async (app) => {
      let refused;

      // The login limit is the lowest, so this is the cheapest way to see one.
      for (let attempt = 0; attempt < 12 && refused === undefined; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          payload: { password: "sbagliata", username: "nessuno" },
          url: "/api/v1/auth/login",
        });

        if (response.statusCode === 429) {
          refused = response;
        }
      }

      expect(refused).toBeDefined();
      expect(refused?.json()).toMatchObject({ code: expect.any(String) });
      expect(Object.keys(refused?.json() as object).sort()).toEqual(["code", "message"]);
    });
  });
});
