import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadConfig, type AppConfig } from "@estia/config";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const MARKER = '<div id="root">client</div>';

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

/** Stands in for a real build: the serving behaviour is what is under test. */
async function withServedClient(
  use: (app: FastifyInstance) => Promise<void>,
  options: { withBuild?: boolean } = {},
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const webRoot = path.join(dataDir, "public");

    if (options.withBuild !== false) {
      mkdirSync(webRoot, { recursive: true });
      writeFileSync(path.join(webRoot, "index.html"), `<!doctype html>${MARKER}`, "utf8");
      writeFileSync(path.join(webRoot, "app.css"), "body{}", "utf8");
    }

    await withClosable(await buildApp(configFor(dataDir), { setupToken: "t", webRoot }), use);
  });
}

describe("web client serving", () => {
  it("serves the client at the root", async () => {
    await withServedClient(async (app) => {
      const response = await app.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(MARKER);
    });
  });

  it("hands unknown page paths to the client router", async () => {
    await withServedClient(async (app) => {
      for (const url of ["/accedi", "/amministrazione", "/entra?codice=ABCD"]) {
        const response = await app.inject({ method: "GET", url });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain(MARKER);
      }
    });
  });

  it("keeps unknown API paths a JSON 404", async () => {
    await withServedClient(async (app) => {
      const response = await app.inject({ method: "GET", url: "/api/v1/non-esiste" });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("not_found");
      expect(response.body).not.toContain(MARKER);
    });
  });

  it("does not turn a wrong method into a page", async () => {
    await withServedClient(async (app) => {
      const response = await app.inject({ method: "POST", url: "/qualcosa" });

      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain(MARKER);
    });
  });

  it("sends a policy that forbids anything inline or third-party", async () => {
    await withServedClient(async (app) => {
      const response = await app.inject({ method: "GET", url: "/" });
      const policy = response.headers["content-security-policy"];

      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("frame-ancestors 'none'");
      // No 'unsafe-inline' anywhere: a stolen script must have nowhere to run.
      expect(policy).not.toContain("unsafe-inline");
      expect(policy).not.toContain("unsafe-eval");

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["referrer-policy"]).toBe("no-referrer");
    });
  });

  it("still serves the API when the client has not been built", async () => {
    await withServedClient(
      async (app) => {
        expect((await app.inject({ method: "GET", url: "/health/ready" })).statusCode).toBe(200);
        expect((await app.inject({ method: "GET", url: "/api/v1/instance" })).statusCode).toBe(200);
        // Without a build there is no page to fall back to.
        expect((await app.inject({ method: "GET", url: "/accedi" })).statusCode).toBe(404);
      },
      { withBuild: false },
    );
  });
});
