import type { AppConfig } from "@estia/config";
import { withClosable } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

const testConfig: AppConfig = {
  host: "127.0.0.1",
  logLevel: "silent",
  port: 3000,
};

describe("core API health endpoints", () => {
  it("returns a successful liveness response without listening on a TCP port", async () => {
    await withClosable(await buildApp(testConfig), async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/health/live",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  it("returns a successful readiness response without listening on a TCP port", async () => {
    await withClosable(await buildApp(testConfig), async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    });
  });

  it("publishes the health routes in the generated OpenAPI document", async () => {
    await withClosable(await buildApp(testConfig), async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/openapi.json",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        openapi: "3.0.3",
        paths: {
          "/health/live": expect.any(Object),
          "/health/ready": expect.any(Object),
        },
      });
    });
  });
});
