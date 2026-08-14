import { cpSync } from "node:fs";
import path from "node:path";

import { loadConfig, type AppConfig } from "@estia/config";
import { withClosable, withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

/**
 * Gate M1, criterio 4: a backup and a restore must preserve the instance, its
 * identity, its accounts and its configuration.
 *
 * The backup is a copy of the data directory taken with the instance stopped —
 * the procedure SECURITY_BASELINE §8 prescribes before an upgrade. Copying it
 * while running would risk catching the WAL mid-write, which is precisely why
 * the documented procedure says to stop first.
 */
describe("backup and restore", () => {
  it("brings back identity, accounts and configuration", async () => {
    await withTempDataDir(async (original) => {
      let publicKey: string;
      let inviteCode: string;

      const app = await buildApp(configFor(original), { setupToken: SETUP_TOKEN });

      try {
        const setup = await app.inject({
          method: "POST",
          payload: {
            adminPassword: ADMIN.password,
            adminUsername: ADMIN.username,
            description: "Il feed del quartiere",
            name: "Via Roma",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });

        publicKey = setup.json().instance.publicKey;

        const login = await app.inject({
          method: "POST",
          payload: { password: ADMIN.password, username: ADMIN.username },
          url: "/api/v1/auth/login",
        });

        const invite = await app.inject({
          headers: { authorization: `Bearer ${login.json().token}` },
          method: "POST",
          payload: { label: "Scala B" },
          url: "/api/v1/admin/invites",
        });

        inviteCode = invite.json().code;
      } finally {
        // Stopped before copying, as the documented procedure requires.
        await app.close();
      }

      await withTempDataDir(async (restoreRoot) => {
        const restored = path.join(restoreRoot, "data");
        cpSync(original, restored, { recursive: true });

        const revived = await buildApp(configFor(restored), { setupToken: "un-altro-token" });

        await withClosable(revived, async (instance) => {
          const view = await instance.inject({ method: "GET", url: "/api/v1/instance" });

          // Same identity: members who pinned this key still recognise it.
          expect(view.json()).toMatchObject({
            description: "Il feed del quartiere",
            name: "Via Roma",
            publicKey,
            state: "configured",
          });

          const login = await instance.inject({
            method: "POST",
            payload: { password: ADMIN.password, username: ADMIN.username },
            url: "/api/v1/auth/login",
          });

          expect(login.statusCode).toBe(200);
          expect(login.json().user.role).toBe("instance_admin");

          // Invites survive too, so a code already handed out still works.
          const asked = await instance.inject({
            method: "POST",
            payload: {
              inviteCode,
              password: "password-della-vicina",
              username: "vicina",
            },
            url: "/api/v1/join/request",
          });

          expect(asked.statusCode).toBe(201);
        });
      });
    });
  });

  it("leaves a restored copy independent of the original", async () => {
    await withTempDataDir(async (original) => {
      const app = await buildApp(configFor(original), { setupToken: SETUP_TOKEN });

      try {
        await app.inject({
          method: "POST",
          payload: {
            adminPassword: ADMIN.password,
            adminUsername: ADMIN.username,
            name: "Via Roma",
            setupToken: SETUP_TOKEN,
          },
          url: "/api/v1/instance/setup",
        });
      } finally {
        await app.close();
      }

      await withTempDataDir(async (restoreRoot) => {
        const restored = path.join(restoreRoot, "data");
        cpSync(original, restored, { recursive: true });

        const copy = await buildApp(configFor(restored), { setupToken: SETUP_TOKEN });

        await withClosable(copy, async (instance) => {
          // A second setup must still be refused: the copy is a configured
          // instance, not a blank one.
          const attempt = await instance.inject({
            method: "POST",
            payload: {
              adminPassword: "un-altra-password",
              adminUsername: "intruso",
              name: "Dirottamento",
              setupToken: SETUP_TOKEN,
            },
            url: "/api/v1/instance/setup",
          });

          expect(attempt.statusCode).toBe(409);
        });
      });
    });
  });
});
