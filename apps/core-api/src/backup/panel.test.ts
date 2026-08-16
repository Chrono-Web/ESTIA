import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadConfig, type AppConfig } from "@estia/config";
import type { BackupSettingsView } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

/**
 * Backups from the panel, without a terminal (ADR 0016).
 *
 * The tests go through the HTTP surface an administrator actually uses, not
 * through the service: the point of the decision is that a person can do this
 * from a browser, and only the routes prove that.
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
  use: (app: FastifyInstance, token: string, dataDir: string) => Promise<void>,
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

      await use(instance, token as string, dataDir);
    });
  });
}

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

describe("turning backups on without a terminal", () => {
  it("starts from nothing configured, and says where archives would go", async () => {
    await withAdmin(async (app, token) => {
      const view = (
        await app.inject({ headers: auth(token), url: "/api/v1/admin/backups/settings" })
      ).json() as BackupSettingsView;

      expect(view).toMatchObject({
        configured: false,
        directoryIsBesideData: true,
        editable: true,
        source: "panel",
      });
      expect(view.publicKey).toBeUndefined();
    });
  });

  /** The whole flow, in the order a person would do it. */
  it("generates a pair, keeps only the public half, and starts backing up", async () => {
    await withAdmin(async (app, token, dataDir) => {
      const keys = (
        await app.inject({
          headers: auth(token),
          method: "POST",
          url: "/api/v1/admin/backups/keys",
        })
      ).json() as { privateKey: string; publicKey: string };

      expect(keys.privateKey).toMatch(/^AGE-SECRET-KEY-/);
      expect(keys.publicKey).toMatch(/^age1/);

      const saved = await app.inject({
        headers: auth(token),
        method: "PUT",
        payload: { intervalHours: 12, keep: 3, publicKey: keys.publicKey },
        url: "/api/v1/admin/backups/settings",
      });

      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({
        configured: true,
        intervalHours: 12,
        keep: 3,
        publicKey: keys.publicKey,
      });

      const made = await app.inject({
        headers: auth(token),
        method: "POST",
        url: "/api/v1/admin/backups",
      });

      expect(made.statusCode).toBe(201);
      expect(made.json().name).toMatch(/^estia-.*\.tar\.age$/);

      // On disk where the view said it would be, and beside the data.
      expect(readdirSync(path.join(dataDir, "backup"))).toHaveLength(1);

      const listed = (
        await app.inject({ headers: auth(token), url: "/api/v1/admin/backups" })
      ).json() as { archives: { byteSize: number; name: string }[] };

      expect(listed.archives).toHaveLength(1);
      expect(listed.archives[0]?.byteSize).toBeGreaterThan(0);

      // And the point of the whole thing: it comes off the machine.
      const downloaded = await app.inject({
        headers: auth(token),
        url: `/api/v1/admin/backups/${listed.archives[0]?.name ?? ""}`,
      });

      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.headers["content-disposition"]).toContain(listed.archives[0]?.name);
      expect(downloaded.rawPayload.byteLength).toBe(listed.archives[0]?.byteSize);
      // It is an age archive, and the instance cannot read it back.
      expect(downloaded.rawPayload.subarray(0, 21).toString()).toBe("age-encryption.org/v1");
    });
  });

  /** The mistake that would put on the instance the secret that must stay off it. */
  it("refuses the private key where the public one belongs, and says why", async () => {
    await withAdmin(async (app, token) => {
      const response = await app.inject({
        headers: auth(token),
        method: "PUT",
        payload: { intervalHours: 24, keep: 7, publicKey: "AGE-SECRET-KEY-1QQQQ" },
        url: "/api/v1/admin/backups/settings",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/chiave PRIVATA/);
    });
  });

  it("refuses something that is not an age key at all", async () => {
    await withAdmin(async (app, token) => {
      const response = await app.inject({
        headers: auth(token),
        method: "PUT",
        payload: { intervalHours: 24, keep: 7, publicKey: "ssh-ed25519 AAAA" },
        url: "/api/v1/admin/backups/settings",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  it("will not make a backup before there is a key to encrypt it to", async () => {
    await withAdmin(async (app, token) => {
      const response = await app.inject({
        headers: auth(token),
        method: "POST",
        url: "/api/v1/admin/backups",
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("backup_not_configured");
    });
  });
});

describe("when the environment already carries the configuration", () => {
  const ENVIRONMENT = {
    ESTIA_BACKUP_DIR: "/tmp/estia-backup-di-prova",
    ESTIA_BACKUP_PUBLIC_KEY: "age1esempio",
  };

  /**
   * Two sources of truth that disagree in silence are worse than one that is
   * inconvenient: the panel shows the value and refuses to pretend it can
   * change it.
   */
  it("shows the value, says where it comes from, and refuses to edit it", async () => {
    await withAdmin(async (app, token) => {
      const view = (
        await app.inject({ headers: auth(token), url: "/api/v1/admin/backups/settings" })
      ).json() as BackupSettingsView;

      expect(view).toMatchObject({
        configured: true,
        directory: ENVIRONMENT.ESTIA_BACKUP_DIR,
        directoryIsBesideData: false,
        editable: false,
        publicKey: ENVIRONMENT.ESTIA_BACKUP_PUBLIC_KEY,
        source: "environment",
      });

      const refused = await app.inject({
        headers: auth(token),
        method: "PUT",
        payload: { intervalHours: 1, keep: 1, publicKey: "age1altra" },
        url: "/api/v1/admin/backups/settings",
      });

      expect(refused.statusCode).toBe(409);
      expect(refused.json().code).toBe("backup_settings_from_environment");
    }, ENVIRONMENT);
  });
});

describe("who may touch any of this", () => {
  it("is nobody without a session", async () => {
    await withAdmin(async (app) => {
      for (const url of ["/api/v1/admin/backups", "/api/v1/admin/backups/settings"]) {
        expect((await app.inject({ url })).statusCode).toBe(401);
      }
    });
  });

  it("is not an ordinary member", async () => {
    await withAdmin(async (app, token) => {
      const invite = (
        await app.inject({
          headers: auth(token),
          method: "POST",
          payload: {},
          url: "/api/v1/admin/invites",
        })
      ).json();

      await app.inject({
        method: "POST",
        payload: {
          inviteCode: invite.code,
          password: "password-della-vicina",
          username: "vicina",
        },
        url: "/api/v1/join/request",
      });

      const pending = (
        await app.inject({
          headers: auth(token),
          url: "/api/v1/admin/join-requests?status=pending",
        })
      ).json();

      await app.inject({
        headers: auth(token),
        method: "POST",
        url: `/api/v1/admin/join-requests/${pending.requests[0].id}/approve`,
      });

      const member = (
        await app.inject({
          method: "POST",
          payload: { password: "password-della-vicina", username: "vicina" },
          url: "/api/v1/auth/login",
        })
      ).json().token;

      expect(
        (await app.inject({ headers: auth(member as string), url: "/api/v1/admin/backups" }))
          .statusCode,
      ).toBe(403);
    });
  });
});

describe("downloading an archive by name", () => {
  /**
   * A name arriving from the network is otherwise a way to ask for any file on
   * the NAS. It is matched against the shape the instance writes, and nothing
   * else is opened.
   */
  it("refuses a name that tries to climb out of the directory", async () => {
    await withAdmin(async (app, token, dataDir) => {
      // Something worth stealing, one level up from where archives live.
      expect(existsSync(path.join(dataDir, "instance-identity.pem"))).toBe(true);

      for (const name of [
        "../instance-identity.pem",
        "..%2Finstance-identity.pem",
        "estia-2026-08-16T00-00-00Z.tar.age/../../instance-identity.pem",
        "estia.db",
      ]) {
        const response = await app.inject({
          headers: auth(token),
          url: `/api/v1/admin/backups/${encodeURIComponent(name)}`,
        });

        expect({ name, status: response.statusCode }).toEqual({ name, status: 404 });
      }
    });
  });

  it("refuses a name that looks right but is not there", async () => {
    await withAdmin(async (app, token) => {
      const response = await app.inject({
        headers: auth(token),
        url: "/api/v1/admin/backups/estia-2026-01-01T00-00-00Z.tar.age",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  /** A shared folder holds other people's files, and none of them are ours. */
  it("does not list files it did not write", async () => {
    await withAdmin(async (app, token, dataDir) => {
      const directory = path.join(dataDir, "backup");

      await app.inject({
        headers: auth(token),
        method: "PUT",
        payload: { intervalHours: 24, keep: 7, publicKey: "age1esempio" },
        url: "/api/v1/admin/backups/settings",
      });

      // A shared folder that already holds other people's things.
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(dataDir, "backup-finto.txt"), "x");
      writeFileSync(path.join(directory, "appunti.txt"), "x");
      writeFileSync(path.join(directory, "estia-2026-01-01T00-00-00Z.tar.age"), "archivio");

      const listed = (
        await app.inject({ headers: auth(token), url: "/api/v1/admin/backups" })
      ).json() as { archives: { name: string }[] };

      expect(listed.archives.map((archive) => archive.name)).toEqual([
        "estia-2026-01-01T00-00-00Z.tar.age",
      ]);
    });
  });
});
