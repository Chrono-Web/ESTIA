import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { openDatabase } from "../db/database.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };
const VICINA = { password: "password-della-vicina", username: "vicina" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function withInstance(
  use: (context: { app: FastifyInstance; dataDir: string; admin: string }) => Promise<void>,
): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

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

      await use({ admin: login.json().token, app, dataDir });
    } finally {
      await app.close();
    }
  });
}

function createInvite(app: FastifyInstance, admin: string, body: Record<string, unknown> = {}) {
  return app.inject({
    headers: { ...bearer(admin), host: "192.168.1.50:3000" },
    method: "POST",
    payload: body,
    url: "/api/v1/admin/invites",
  });
}

function ask(
  app: FastifyInstance,
  inviteCode: string,
  who: { username: string; password: string },
  message = "",
) {
  return app.inject({
    method: "POST",
    payload: { inviteCode, message, password: who.password, username: who.username },
    url: "/api/v1/join/request",
  });
}

function login(app: FastifyInstance, who: { username: string; password: string }) {
  return app.inject({
    method: "POST",
    payload: { password: who.password, username: who.username },
    url: "/api/v1/auth/login",
  });
}

describe("invites", () => {
  it("hands the code out once and keeps only its hash", async () => {
    await withInstance(async ({ app, admin, dataDir }) => {
      const response = await createInvite(app, admin, { label: "Scala B" });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
      expect(body.joinUrl).toBe(`http://192.168.1.50:3000/entra?codice=${body.code}`);
      expect(body.invite).toMatchObject({
        label: "Scala B",
        maxUses: 1,
        usable: true,
        usedCount: 0,
      });

      const database = openDatabase(dataDir);

      try {
        const rows = database.prepare("SELECT code_hash FROM invites").all() as {
          code_hash: string;
        }[];

        expect(rows[0]?.code_hash).not.toBe(body.code);
        expect(rows[0]?.code_hash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        database.close();
      }

      // The listing never replays the code.
      const list = await app.inject({
        headers: bearer(admin),
        method: "GET",
        url: "/api/v1/admin/invites",
      });
      expect(list.body).not.toContain(body.code);
    });
  });

  it("is single use unless the administrator asks otherwise", async () => {
    await withInstance(async ({ app, admin }) => {
      expect((await createInvite(app, admin)).json().invite.maxUses).toBe(1);
      expect((await createInvite(app, admin, { maxUses: 5 })).json().invite.maxUses).toBe(5);
    });
  });

  it("refuses a revoked invite", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();

      const revoked = await app.inject({
        headers: bearer(admin),
        method: "DELETE",
        url: `/api/v1/admin/invites/${created.invite.id}`,
      });
      expect(revoked.statusCode).toBe(204);

      const attempt = await ask(app, created.code, VICINA);
      expect(attempt.statusCode).toBe(403);
      expect(attempt.json().code).toBe("invalid_invite");
    });
  });

  it("refuses an invented invite", async () => {
    await withInstance(async ({ app }) => {
      const attempt = await ask(app, "ZZZZ-ZZZZ-ZZZZ-ZZZZ", VICINA);

      expect(attempt.statusCode).toBe(403);
    });
  });
});

describe("admission", () => {
  it("turns a valid invite into a request, never into an account", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();

      const asked = await ask(app, created.code, VICINA, "sono del secondo piano");
      expect(asked.statusCode).toBe(201);
      expect(asked.json()).toMatchObject({
        message: "sono del secondo piano",
        status: "pending",
        username: "vicina",
      });

      // ADR 0003, requisito 3: holding an invite is not being admitted.
      expect((await login(app, VICINA)).statusCode).toBe(401);

      const diagnostics = await app.inject({
        headers: bearer(admin),
        method: "GET",
        url: "/api/v1/admin/diagnostics",
      });
      expect(diagnostics.json().memberCount).toBe(1);
    });
  });

  it("creates the account on approval, with the password chosen when asking", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      const approved = await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/approve`,
      });

      expect(approved.statusCode).toBe(200);
      expect(approved.json().status).toBe("approved");

      const session = await login(app, VICINA);
      expect(session.statusCode).toBe(200);
      expect(session.json().user).toMatchObject({ role: "member", username: "vicina" });
    });
  });

  it("consumes a single-use invite once it has admitted someone", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/approve`,
      });

      const second = await ask(app, created.code, {
        password: "un-altra-password",
        username: "altro",
      });
      expect(second.statusCode).toBe(403);
    });
  });

  it("lets a reusable invite admit more than one person", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin, { maxUses: 3 })).json();

      for (const username of ["vicina", "vicino", "portiere"]) {
        const asked = (
          await ask(app, created.code, { password: "password-lunga-ok", username })
        ).json();
        const approved = await app.inject({
          headers: bearer(admin),
          method: "POST",
          url: `/api/v1/admin/join-requests/${asked.id}/approve`,
        });
        expect(approved.statusCode).toBe(200);
      }

      const exhausted = await ask(app, created.code, {
        password: "password-lunga-ok",
        username: "quarto",
      });
      expect(exhausted.statusCode).toBe(403);
    });
  });

  it("creates nothing when a request is rejected", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      const rejected = await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/reject`,
      });

      expect(rejected.statusCode).toBe(200);
      expect((await login(app, VICINA)).statusCode).toBe(401);
    });
  });

  it("refuses to decide the same request twice", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/approve`,
      });

      const again = await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/reject`,
      });

      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe("join_request_already_decided");
    });
  });

  it("refuses a username already taken or already requested", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin, { maxUses: 5 })).json();

      expect(
        (await ask(app, created.code, { ...VICINA, username: ADMIN.username })).statusCode,
      ).toBe(409);

      await ask(app, created.code, VICINA);
      expect((await ask(app, created.code, VICINA)).statusCode).toBe(409);
    });
  });

  it("lists pending requests and drops them once decided", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      const pending = await app.inject({
        headers: bearer(admin),
        method: "GET",
        url: "/api/v1/admin/join-requests",
      });
      expect(pending.json().requests).toHaveLength(1);

      await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/approve`,
      });

      const after = await app.inject({
        headers: bearer(admin),
        method: "GET",
        url: "/api/v1/admin/join-requests",
      });
      expect(after.json().requests).toHaveLength(0);
    });
  });
});

describe("audit", () => {
  it("records administrative acts without any credential", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/approve`,
      });

      const audit = await app.inject({
        headers: bearer(admin),
        method: "GET",
        url: "/api/v1/admin/audit",
      });

      const actions = audit.json().events.map((event: { action: string }) => event.action);
      expect(actions).toContain("invite_created");
      expect(actions).toContain("member_admitted");
      expect(audit.json().events[0].actorUsername).toBe(ADMIN.username);

      expect(audit.body).not.toContain(created.code);
      expect(audit.body).not.toContain(VICINA.password);
    });
  });
});

describe("who may admit", () => {
  it("keeps admission away from members and from anonymous callers", async () => {
    await withInstance(async ({ app, admin }) => {
      const created = (await createInvite(app, admin)).json();
      const asked = (await ask(app, created.code, VICINA)).json();

      await app.inject({
        headers: bearer(admin),
        method: "POST",
        url: `/api/v1/admin/join-requests/${asked.id}/approve`,
      });

      const memberToken = (await login(app, VICINA)).json().token;

      for (const url of [
        "/api/v1/admin/invites",
        "/api/v1/admin/join-requests",
        "/api/v1/admin/audit",
      ]) {
        expect(
          (await app.inject({ headers: bearer(memberToken), method: "GET", url })).statusCode,
        ).toBe(403);
        expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
      }
    });
  });
});
