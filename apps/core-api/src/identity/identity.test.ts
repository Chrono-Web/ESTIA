import { Writable } from "node:stream";

import type { AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp, type BuildAppOptions } from "../app.js";
import { openDatabase } from "../db/database.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "admin" };

function configFor(dataDir: string, logLevel: AppConfig["logLevel"] = "silent"): AppConfig {
  return { dataDir, host: "127.0.0.1", logLevel, port: 3000 };
}

/** Builds an instance already configured, with its administrator logged in. */
async function withConfiguredApp(
  use: (context: { app: FastifyInstance; dataDir: string; adminToken: string }) => Promise<void>,
  options: BuildAppOptions = {},
  logLevel: AppConfig["logLevel"] = "silent",
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir, logLevel), {
      setupToken: SETUP_TOKEN,
      ...options,
    });

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

      const login = await app.inject({
        method: "POST",
        payload: { password: ADMIN.password, username: ADMIN.username },
        url: "/api/v1/auth/login",
      });

      await use({ adminToken: login.json().token, app, dataDir });
    } finally {
      await app.close();
    }
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe("login", () => {
  it("issues a session for valid credentials", async () => {
    await withConfiguredApp(async ({ app }) => {
      const response = await app.inject({
        method: "POST",
        payload: {
          deviceLabel: "Portatile di casa",
          password: ADMIN.password,
          username: ADMIN.username,
        },
        url: "/api/v1/auth/login",
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      expect(body.user).toEqual({
        displayName: "admin",
        id: expect.any(String),
        role: "instance_admin",
        username: "admin",
      });
      // The identity of a user is its opaque id, never its username.
      expect(body.user.id).not.toBe(body.user.username);
    });
  });

  it("gives the same answer for a wrong password and an unknown account", async () => {
    await withConfiguredApp(async ({ app }) => {
      const wrongPassword = await app.inject({
        method: "POST",
        payload: { password: "password-sbagliata", username: ADMIN.username },
        url: "/api/v1/auth/login",
      });

      const unknownUser = await app.inject({
        method: "POST",
        payload: { password: ADMIN.password, username: "nessuno" },
        url: "/api/v1/auth/login",
      });

      // Anything that differed here would let an attacker enumerate accounts.
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownUser.statusCode).toBe(401);
      expect(wrongPassword.json()).toEqual(unknownUser.json());
    });
  });

  it("is case-insensitive on the username", async () => {
    await withConfiguredApp(async ({ app }) => {
      const response = await app.inject({
        method: "POST",
        payload: { password: ADMIN.password, username: "ADMIN" },
        url: "/api/v1/auth/login",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  it("stores no usable credential in the database", async () => {
    await withConfiguredApp(async ({ app, dataDir }) => {
      const login = await app.inject({
        method: "POST",
        payload: { password: ADMIN.password, username: ADMIN.username },
        url: "/api/v1/auth/login",
      });

      const token = login.json().token;
      const database = openDatabase(dataDir);

      try {
        const sessions = database.prepare("SELECT token_hash FROM sessions").all() as {
          token_hash: string;
        }[];
        const users = database.prepare("SELECT password_hash FROM users").all() as {
          password_hash: string;
        }[];

        expect(sessions.length).toBeGreaterThan(0);

        // SECURITY_BASELINE §3: reading the database must not yield a credential.
        for (const session of sessions) {
          expect(session.token_hash).not.toBe(token);
          expect(session.token_hash).toMatch(/^[a-f0-9]{64}$/);
        }

        for (const user of users) {
          expect(user.password_hash).not.toContain(ADMIN.password);
          expect(user.password_hash.startsWith("$argon2id$")).toBe(true);
        }
      } finally {
        database.close();
      }
    });
  });

  it("writes neither the password nor the token to the logs", async () => {
    const written: string[] = [];
    const capture = new Writable({
      write(chunk, _encoding, callback): void {
        written.push(String(chunk));
        callback();
      },
    });

    await withConfiguredApp(
      async ({ app }) => {
        await app.inject({
          method: "POST",
          payload: { password: "password-segretissima", username: ADMIN.username },
          url: "/api/v1/auth/login",
        });

        await app.inject({
          headers: bearer("token-inventato-dall-attaccante"),
          method: "GET",
          url: "/api/v1/auth/me",
        });

        const logs = written.join("");

        expect(logs.length).toBeGreaterThan(0);
        expect(logs).not.toContain("password-segretissima");
        expect(logs).not.toContain("token-inventato-dall-attaccante");
        expect(logs).not.toContain(ADMIN.password);
      },
      { logDestination: capture },
      "info",
    );
  });
});

describe("authenticated access", () => {
  it("refuses a missing, malformed or invented token", async () => {
    await withConfiguredApp(async ({ app }) => {
      for (const headers of [{}, { authorization: "Basic abc" }, bearer("inventato")]) {
        const response = await app.inject({ headers, method: "GET", url: "/api/v1/auth/me" });

        expect(response.statusCode).toBe(401);
        expect(response.json().code).toBe("unauthenticated");
      }
    });
  });

  it("returns the caller without any credential material", async () => {
    await withConfiguredApp(async ({ app, adminToken }) => {
      const response = await app.inject({
        headers: bearer(adminToken),
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json()).sort()).toEqual([
        "displayName",
        "id",
        "role",
        "username",
      ]);
      expect(response.body).not.toContain("argon2");
    });
  });
});

describe("sessions and revocation", () => {
  it("invalidates the token immediately on logout", async () => {
    await withConfiguredApp(async ({ app, adminToken }) => {
      const logout = await app.inject({
        headers: bearer(adminToken),
        method: "POST",
        url: "/api/v1/auth/logout",
      });

      expect(logout.statusCode).toBe(204);

      const after = await app.inject({
        headers: bearer(adminToken),
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(after.statusCode).toBe(401);
    });
  });

  it("lists the caller's sessions and marks the current one", async () => {
    await withConfiguredApp(async ({ app, adminToken }) => {
      await app.inject({
        method: "POST",
        payload: {
          deviceLabel: "Secondo dispositivo",
          password: ADMIN.password,
          username: ADMIN.username,
        },
        url: "/api/v1/auth/login",
      });

      const response = await app.inject({
        headers: bearer(adminToken),
        method: "GET",
        url: "/api/v1/auth/sessions",
      });

      // One from the fixture's login, one from the login above.
      const sessions = response.json().sessions;
      expect(sessions.length).toBe(2);
      expect(sessions.filter((s: { current: boolean }) => s.current).length).toBe(1);
      expect(sessions.map((s: { deviceLabel: string }) => s.deviceLabel)).toContain(
        "Secondo dispositivo",
      );
    });
  });

  it("revoking another session cuts it off at once", async () => {
    await withConfiguredApp(async ({ app, adminToken }) => {
      const second = await app.inject({
        method: "POST",
        payload: { deviceLabel: "Telefono", password: ADMIN.password, username: ADMIN.username },
        url: "/api/v1/auth/login",
      });
      const secondToken = second.json().token;

      const list = await app.inject({
        headers: bearer(secondToken),
        method: "GET",
        url: "/api/v1/auth/sessions",
      });
      const target = list.json().sessions.find((s: { current: boolean }) => s.current);

      const revoked = await app.inject({
        headers: bearer(adminToken),
        method: "DELETE",
        url: `/api/v1/auth/sessions/${target.id}`,
      });

      expect(revoked.statusCode).toBe(204);

      const after = await app.inject({
        headers: bearer(secondToken),
        method: "GET",
        url: "/api/v1/auth/me",
      });

      expect(after.statusCode).toBe(401);
    });
  });

  it("never lets one account touch another account's session", async () => {
    await withConfiguredApp(async ({ app, adminToken }) => {
      await app.identityService.createUser({
        password: "password-del-membro",
        role: "member",
        username: "vicina",
      });

      const member = await app.inject({
        method: "POST",
        payload: { password: "password-del-membro", username: "vicina" },
        url: "/api/v1/auth/login",
      });
      const memberToken = member.json().token;

      const adminSessions = await app.inject({
        headers: bearer(adminToken),
        method: "GET",
        url: "/api/v1/auth/sessions",
      });
      const adminSessionId = adminSessions.json().sessions[0].id;

      const attempt = await app.inject({
        headers: bearer(memberToken),
        method: "DELETE",
        url: `/api/v1/auth/sessions/${adminSessionId}`,
      });

      // Scoped by user: the session is invisible, not merely forbidden.
      expect(attempt.statusCode).toBe(404);

      const adminStillWorks = await app.inject({
        headers: bearer(adminToken),
        method: "GET",
        url: "/api/v1/auth/me",
      });
      expect(adminStillWorks.statusCode).toBe(200);
    });
  });
});

describe("roles", () => {
  it("keeps administrative diagnostics away from a member", async () => {
    await withConfiguredApp(async ({ app, adminToken }) => {
      await app.identityService.createUser({
        password: "password-del-membro",
        role: "member",
        username: "vicina",
      });

      const member = await app.inject({
        method: "POST",
        payload: { password: "password-del-membro", username: "vicina" },
        url: "/api/v1/auth/login",
      });

      const denied = await app.inject({
        headers: bearer(member.json().token),
        method: "GET",
        url: "/api/v1/admin/diagnostics",
      });

      expect(denied.statusCode).toBe(403);
      expect(denied.json().code).toBe("forbidden");

      const allowed = await app.inject({
        headers: bearer(adminToken),
        method: "GET",
        url: "/api/v1/admin/diagnostics",
      });

      expect(allowed.statusCode).toBe(200);
      // ADR 0007: never claim protection that has not been verified.
      expect(allowed.json()).toEqual({
        atRestEncryption: "unknown",
        instanceState: "configured",
        memberCount: 2,
      });
    });
  });

  it("refuses administrative diagnostics to an anonymous caller", async () => {
    await withConfiguredApp(async ({ app }) => {
      const response = await app.inject({ method: "GET", url: "/api/v1/admin/diagnostics" });

      expect(response.statusCode).toBe(401);
    });
  });
});
