import { loadConfig, type AppConfig } from "@estia/config";
import type { AdminDiagnostics, NetworkProbeReport } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

/**
 * Turning the network probe on without a terminal.
 *
 * ADR 0016 learned this about the backups, and it applies unchanged here: a
 * switch that lives only in a file on the NAS is a switch nobody flips. This
 * measurement needs **two houses**, so it has to be reachable by whoever is
 * standing in them — from a browser, not from SSH.
 */

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };

function configFor(dataDir: string, environment: Record<string, string> = {}): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
    ...environment,
  });
}

async function withAdmin(
  use: (app: FastifyInstance, token: string) => Promise<void>,
  environment: Record<string, string> = {},
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir, environment), { setupToken: SETUP_TOKEN });

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

      const token = (
        await instance.inject({
          method: "POST",
          payload: { password: ADMIN.password, username: ADMIN.username },
          url: "/api/v1/auth/login",
        })
      ).json().token;

      await use(instance, token as string);
    });
  });
}

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

const network = async (app: FastifyInstance, token: string): Promise<NetworkProbeReport> =>
  (
    (
      await app.inject({ headers: auth(token), url: "/api/v1/admin/diagnostics" })
    ).json() as AdminDiagnostics
  ).network;

describe("turning the network probe on from the panel", () => {
  it("is off on a fresh instance, and says so where it can be turned on", async () => {
    await withAdmin(async (app, token) => {
      const report = await network(app, token);

      expect(report).toMatchObject({ editable: true, mode: "off", state: "off" });
      // The panel must be able to explain it, not only display a switch.
      expect(report.detail).toMatch(/chiave pubblica/);
    });
  });

  it("turns on, hands out an address made of a key, and turns off again", async () => {
    await withAdmin(async (app, token) => {
      const turnedOn = (
        await app.inject({
          headers: auth(token),
          method: "PUT",
          payload: { mode: "local" },
          url: "/api/v1/admin/network/settings",
        })
      ).json() as NetworkProbeReport;

      expect(turnedOn.state).toBe("ready");
      expect(turnedOn.endpointId).toMatch(/\w{16,}/);
      expect(turnedOn.ticket).toBeTruthy();
      expect(turnedOn.usesPublicInfrastructure).toBe(false);

      // And the diagnostics agree with what the switch answered.
      expect((await network(app, token)).state).toBe("ready");

      await app.inject({
        headers: auth(token),
        method: "PUT",
        payload: { mode: "off" },
        url: "/api/v1/admin/network/settings",
      });

      expect(await network(app, token)).toMatchObject({ mode: "off", state: "off" });
    });
  }, 30_000);

  it("shows the value but refuses the change when the environment carries it", async () => {
    await withAdmin(
      async (app, token) => {
        const report = await network(app, token);

        expect(report).toMatchObject({ editable: false, mode: "local", state: "ready" });

        const refused = await app.inject({
          headers: auth(token),
          method: "PUT",
          payload: { mode: "off" },
          url: "/api/v1/admin/network/settings",
        });

        expect(refused.statusCode).toBe(409);
        // And it is still on: a refused edit must not half-apply.
        expect((await network(app, token)).state).toBe("ready");
      },
      { ESTIA_NETWORK_PROBE: "local" },
    );
  }, 30_000);

  it("keeps a member out of it", async () => {
    await withAdmin(async (app) => {
      const refused = await app.inject({
        method: "PUT",
        payload: { mode: "local" },
        url: "/api/v1/admin/network/settings",
      });

      expect(refused.statusCode).toBe(401);
    });
  });
});
