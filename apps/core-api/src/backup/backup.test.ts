import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { encodeJpegForTests, samplePixels } from "../media/fixtures.js";
import { safeDestination, UnsafeArchiveEntryError } from "./archive.js";
import { createBackupKeyPair } from "./crypto.js";
import { backupFileName, createBackup, restoreBackup } from "./service.js";

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

interface Populated {
  dataDir: string;
  publicKey: string;
  mediaId: string;
  postBody: string;
}

/** An instance with an administrator, a member, a post and a real photograph. */
async function withPopulatedInstance(use: (context: Populated) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app: FastifyInstance = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });
    let publicKey = "";
    let mediaId = "";
    const postBody = "La prima foto del quartiere";

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

      const token = (
        await app.inject({
          method: "POST",
          payload: { password: ADMIN.password, username: ADMIN.username },
          url: "/api/v1/auth/login",
        })
      ).json().token;

      const uploaded = await app.inject({
        headers: { authorization: `Bearer ${token}`, "content-type": "image/jpeg" },
        method: "POST",
        payload: Buffer.from(await encodeJpegForTests(samplePixels(400, 300))),
        url: "/api/v1/media",
      });

      mediaId = uploaded.json().id;

      await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: "POST",
        payload: { body: postBody, media: [{ altText: "Il cortile", id: mediaId }] },
        url: "/api/v1/posts",
      });
    } finally {
      await app.close();
    }

    await use({ dataDir, mediaId, postBody, publicKey });
  });
}

describe("creating a backup", () => {
  it("takes the database, the identity and the media, without stopping the instance", async () => {
    await withPopulatedInstance(async ({ dataDir }) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "publicKey", value: keys.publicKey },
        });

        expect(backup.path.endsWith(".tar.age")).toBe(true);
        expect(backup.byteSize).toBeGreaterThan(0);

        // The readme aside: database, instance key, one photo and its thumbnail.
        expect(backup.fileCount).toBe(4);

        // It is an age archive, and says so in its first bytes.
        const head = readFileSync(backup.path).subarray(0, 21).toString("utf8");
        expect(head).toBe("age-encryption.org/v1");

        // The work area is not left behind.
        expect(existsSync(path.join(dataDir, ".backup-work"))).toBe(false);
      });
    });
  });

  it("writes an archive readable only by its owner", async () => {
    await withPopulatedInstance(async ({ dataDir }) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "publicKey", value: keys.publicKey },
        });

        expect(statSync(backup.path).mode & 0o777).toBe(0o600);
      });
    });
  });

  it("names archives so that they sort by date", () => {
    const first = backupFileName(new Date("2026-08-15T09:30:00.000Z"));
    const second = backupFileName(new Date("2026-08-16T08:00:00.000Z"));

    expect(first).toBe("estia-2026-08-15T09-30-00Z.tar.age");
    expect([second, first].sort()).toEqual([first, second]);
  });
});

describe("restoring a backup", () => {
  it("brings back an instance that is still itself", async () => {
    await withPopulatedInstance(async ({ dataDir, mediaId, postBody, publicKey }) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "publicKey", value: keys.publicKey },
        });

        await withTempDataDir(async (restoreRoot) => {
          const restored = path.join(restoreRoot, "istanza");

          await restoreBackup({
            archive: backup.path,
            destination: restored,
            key: { kind: "privateKey", value: keys.privateKey },
          });

          const revived = await buildApp(configFor(restored), { setupToken: "un-altro-token" });

          try {
            // Same identity: the members who pinned this key still recognise it.
            expect(
              (await revived.inject({ method: "GET", url: "/api/v1/instance" })).json(),
            ).toMatchObject({
              name: "Via Roma",
              publicKey,
              state: "configured",
            });

            const token = (
              await revived.inject({
                method: "POST",
                payload: { password: ADMIN.password, username: ADMIN.username },
                url: "/api/v1/auth/login",
              })
            ).json().token;

            const post = (
              await revived.inject({
                headers: { authorization: `Bearer ${token}` },
                method: "GET",
                url: "/api/v1/posts",
              })
            ).json().posts[0];

            expect(post).toMatchObject({ body: postBody });
            expect(post.images).toHaveLength(1);

            // And the photograph itself is there, not just its row.
            const image = await revived.inject({
              headers: { authorization: `Bearer ${token}` },
              method: "GET",
              url: `/api/v1/media/${mediaId}`,
            });

            expect(image.statusCode).toBe(200);
            expect(image.rawPayload.byteLength).toBeGreaterThan(0);
          } finally {
            await revived.close();
          }
        });
      });
    });
  });

  it("refuses the wrong key", async () => {
    await withPopulatedInstance(async ({ dataDir }) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const other = await createBackupKeyPair();
        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "publicKey", value: keys.publicKey },
        });

        await withTempDataDir(async (restoreRoot) => {
          await expect(
            restoreBackup({
              archive: backup.path,
              destination: path.join(restoreRoot, "istanza"),
              key: { kind: "privateKey", value: other.privateKey },
            }),
          ).rejects.toThrow(/chiave sbagliata/i);
        });
      });
    });
  });

  /** A damaged archive must fail loudly, not restore an instance with holes. */
  it("refuses an archive that has been tampered with", async () => {
    await withPopulatedInstance(async ({ dataDir }) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "publicKey", value: keys.publicKey },
        });

        const bytes = readFileSync(backup.path);
        const spot = bytes.length - 30;

        bytes[spot] = bytes[spot]! ^ 0xff;
        writeFileSync(backup.path, bytes);

        await withTempDataDir(async (restoreRoot) => {
          const destination = path.join(restoreRoot, "istanza");

          await expect(
            restoreBackup({
              archive: backup.path,
              destination,
              key: { kind: "privateKey", value: keys.privateKey },
            }),
          ).rejects.toThrow(/danneggiato|chiave sbagliata/i);

          // Nothing half-written left behind.
          expect(existsSync(path.join(destination, "estia.db"))).toBe(false);
        });
      });
    });
  });

  it("works with a passphrase too, and refuses a short one", async () => {
    await withPopulatedInstance(async ({ dataDir, publicKey }) => {
      await withTempDataDir(async (out) => {
        await expect(
          createBackup({
            dataDir,
            destination: out,
            recipient: { kind: "passphrase", value: "corta" },
          }),
        ).rejects.toThrow(/troppo corta/i);

        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "passphrase", value: "una-passphrase-lunga-abbastanza" },
        });

        await withTempDataDir(async (restoreRoot) => {
          const restored = path.join(restoreRoot, "istanza");

          await restoreBackup({
            archive: backup.path,
            destination: restored,
            key: { kind: "passphrase", value: "una-passphrase-lunga-abbastanza" },
          });

          const revived = await buildApp(configFor(restored), { setupToken: "x" });

          try {
            expect(
              (await revived.inject({ method: "GET", url: "/api/v1/instance" })).json().publicKey,
            ).toBe(publicKey);
          } finally {
            await revived.close();
          }
        });
      });
    });
  });

  it("refuses to restore on top of a live instance", async () => {
    await withPopulatedInstance(async ({ dataDir }) => {
      await withTempDataDir(async (out) => {
        const keys = await createBackupKeyPair();
        const backup = await createBackup({
          dataDir,
          destination: out,
          recipient: { kind: "publicKey", value: keys.publicKey },
        });

        // Restoring into the directory it came from would merge into live data.
        await expect(
          restoreBackup({
            archive: backup.path,
            destination: dataDir,
            key: { kind: "privateKey", value: keys.privateKey },
          }),
        ).rejects.toThrow(/c'è già un'istanza/i);
      });
    });
  });
});

describe("an archive is untrusted input", () => {
  it("refuses entries that would escape the destination", () => {
    for (const name of [
      "estia/../../../etc/passwd",
      "../fuori.txt",
      "/etc/passwd",
      "estia/../../fuga",
    ]) {
      expect(() => safeDestination("/tmp/destinazione", name)).toThrow(UnsafeArchiveEntryError);
    }
  });

  it("accepts ordinary entries", () => {
    expect(safeDestination("/tmp/destinazione", "estia/media/ab/foto.jpeg")).toBe(
      "/tmp/destinazione/media/ab/foto.jpeg",
    );
    expect(safeDestination("/tmp/destinazione", "estia/estia.db")).toBe(
      "/tmp/destinazione/estia.db",
    );
  });
});
