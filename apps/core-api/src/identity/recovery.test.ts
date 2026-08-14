import type { AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { openDatabase } from "../db/database.js";
import { createRecoveryCode, hashRecoveryCode, normalizeRecoveryCode } from "./recovery.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };
const CODE_SHAPE = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/;

function configFor(dataDir: string): AppConfig {
  return { dataDir, host: "127.0.0.1", logLevel: "silent", port: 3000 };
}

/** Builds a configured instance and hands back its one-time recovery code. */
async function withRecoverableApp(
  use: (context: {
    app: FastifyInstance;
    dataDir: string;
    recoveryCode: string;
    token: string;
  }) => Promise<void>,
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      const setup = await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const login = await app.inject({
        method: "POST",
        payload: { password: ADMIN.password, username: ADMIN.username },
        url: "/api/v1/auth/login",
      });

      await use({
        app,
        dataDir,
        recoveryCode: setup.json().recoveryCode,
        token: login.json().token,
      });
    } finally {
      await app.close();
    }
  });
}

function recover(
  app: FastifyInstance,
  payload: { username: string; recoveryCode: string; newPassword: string },
) {
  return app.inject({ method: "POST", payload, url: "/api/v1/auth/recover" });
}

function login(app: FastifyInstance, password: string) {
  return app.inject({
    method: "POST",
    payload: { password, username: ADMIN.username },
    url: "/api/v1/auth/login",
  });
}

describe("recovery code format", () => {
  it("is written in an alphabet that survives being copied by hand", () => {
    const code = createRecoveryCode();

    expect(code).toMatch(CODE_SHAPE);
    // No I, L, O or U: the characters people mistake for one another.
    expect(code).not.toMatch(/[ILOU]/u);
  });

  it("does not repeat itself", () => {
    expect(new Set(Array.from({ length: 200 }, () => createRecoveryCode())).size).toBe(200);
  });

  it("forgives the transcription slips that actually happen", () => {
    // Someone reading paper writes O for zero and I or l for one.
    expect(normalizeRecoveryCode("o1i2-l3m4")).toBe(normalizeRecoveryCode("0112-13M4"));
    // Casing and grouping are irrelevant.
    expect(normalizeRecoveryCode("abcd efgh")).toBe(normalizeRecoveryCode("ABCD-EFGH"));
    expect(hashRecoveryCode("abcd-efgh")).toBe(hashRecoveryCode("ABCDEFGH"));
  });
});

describe("account recovery", () => {
  it("hands out a code once at setup", async () => {
    await withRecoverableApp(async ({ recoveryCode }) => {
      expect(recoveryCode).toMatch(CODE_SHAPE);
    });
  });

  it("stores the code only as a hash", async () => {
    await withRecoverableApp(async ({ dataDir, recoveryCode }) => {
      const database = openDatabase(dataDir);

      try {
        const rows = database.prepare("SELECT code_hash FROM recovery_codes").all() as {
          code_hash: string;
        }[];

        expect(rows.length).toBe(1);
        expect(rows[0]?.code_hash).not.toBe(recoveryCode);
        expect(rows[0]?.code_hash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        database.close();
      }
    });
  });

  it("sets a new password and closes every open session", async () => {
    await withRecoverableApp(async ({ app, recoveryCode, token }) => {
      const response = await recover(app, {
        newPassword: "la-nuova-password",
        recoveryCode,
        username: ADMIN.username,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().revokedSessions).toBeGreaterThan(0);

      // Whoever had to recover may have been compromised.
      const stale = await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: "GET",
        url: "/api/v1/auth/me",
      });
      expect(stale.statusCode).toBe(401);

      expect((await login(app, ADMIN.password)).statusCode).toBe(401);
      expect((await login(app, "la-nuova-password")).statusCode).toBe(200);
    });
  });

  it("spends the code and issues a fresh one", async () => {
    await withRecoverableApp(async ({ app, recoveryCode }) => {
      const first = await recover(app, {
        newPassword: "la-nuova-password",
        recoveryCode,
        username: ADMIN.username,
      });

      const nextCode = first.json().recoveryCode;
      expect(nextCode).toMatch(CODE_SHAPE);
      expect(nextCode).not.toBe(recoveryCode);

      // The spent code is dead.
      const replayed = await recover(app, {
        newPassword: "un-altra-password",
        recoveryCode,
        username: ADMIN.username,
      });
      expect(replayed.statusCode).toBe(401);

      // An administrator is never left without a way back in.
      const withNewCode = await recover(app, {
        newPassword: "un-altra-password",
        recoveryCode: nextCode,
        username: ADMIN.username,
      });
      expect(withNewCode.statusCode).toBe(200);
    });
  });

  it("accepts the code however it was written down", async () => {
    await withRecoverableApp(async ({ app, recoveryCode }) => {
      const response = await recover(app, {
        newPassword: "la-nuova-password",
        recoveryCode: recoveryCode.toLowerCase().replaceAll("-", " "),
        username: ADMIN.username,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  it("answers the same way for a wrong code and an unknown account", async () => {
    await withRecoverableApp(async ({ app }) => {
      const wrongCode = await recover(app, {
        newPassword: "la-nuova-password",
        recoveryCode: "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ",
        username: ADMIN.username,
      });

      const unknownUser = await recover(app, {
        newPassword: "la-nuova-password",
        recoveryCode: "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ",
        username: "nessuno",
      });

      expect(wrongCode.statusCode).toBe(401);
      expect(wrongCode.json()).toEqual(unknownUser.json());

      // A failed recovery changes nothing.
      expect((await login(app, ADMIN.password)).statusCode).toBe(200);
    });
  });
});
