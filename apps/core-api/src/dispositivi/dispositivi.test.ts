import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

const SETUP_TOKEN = "setup-token-dispositivi-test";
const ADMIN = { password: "password-valida-123", username: "admin" };

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

interface TestRig {
  app: FastifyInstance;
  aliceToken: string;
  aliceId: string;
  bobToken: string;
  bobId: string;
}

async function withTestRig(use: (rig: TestRig) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Test Casa",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const alice = await app.identityService.createUser({
        password: "password-lunga-alice",
        role: "member",
        username: "alice",
      });
      const aliceLogin = await app.identityService.login({
        password: "password-lunga-alice",
        username: "alice",
      });

      const bob = await app.identityService.createUser({
        password: "password-lunga-bob",
        role: "member",
        username: "bob",
      });
      const bobLogin = await app.identityService.login({
        password: "password-lunga-bob",
        username: "bob",
      });

      await use({
        app,
        aliceToken: aliceLogin.token,
        aliceId: alice.id,
        bobToken: bobLogin.token,
        bobId: bob.id,
      });
    } finally {
      await app.close();
    }
  });
}

describe("dispositivi e identità crittografica (M6 Fase 1)", () => {
  it("registra la chiave pubblica del dispositivo per la sessione attiva", async () => {
    await withTestRig(async ({ app, aliceToken }) => {
      // Alice registra la propria chiave pubblica del dispositivo
      const regRes = await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/chiave",
        headers: bearer(aliceToken),
        payload: {
          publicKey: "pub_key_alice_device_1",
          algorithm: "Ed25519",
          keyPackages: ["kp_1", "kp_2"],
        },
      });

      expect(regRes.statusCode).toBe(200);
      const body = regRes.json();
      expect(body.device.publicKey).toBe("pub_key_alice_device_1");
      expect(body.device.algorithm).toBe("Ed25519");
      expect(body.device.revokedAt).toBeNull();
      expect(body.device.sessionId).toBeDefined();

      // La chiave privata non esiste nella risposta
      expect(JSON.stringify(body)).not.toContain("privateKey");

      // Verifica rotta me
      const meRes = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/chiave/me",
        headers: bearer(aliceToken),
      });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json().device.publicKey).toBe("pub_key_alice_device_1");
    });
  });

  it("pubblica e consuma KeyPackage monouso", async () => {
    await withTestRig(async ({ app, aliceToken, aliceId, bobToken }) => {
      // Alice registra il dispositivo e 2 key package
      await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/chiave",
        headers: bearer(aliceToken),
        payload: {
          publicKey: "pub_key_alice_main",
          algorithm: "Ed25519",
          keyPackages: ["alice_kp_alpha", "alice_kp_beta"],
        },
      });

      // Bob preleva un KeyPackage per Alice
      const claim1 = await app.inject({
        method: "GET",
        url: `/api/v1/dispositivi/key-packages/claim/${aliceId}`,
        headers: bearer(bobToken),
      });
      expect(claim1.statusCode).toBe(200);
      expect(claim1.json().publicKey).toBe("pub_key_alice_main");
      expect(claim1.json().keyPackage).toBe("alice_kp_alpha");

      // Bob preleva un secondo KeyPackage per Alice
      const claim2 = await app.inject({
        method: "GET",
        url: `/api/v1/dispositivi/key-packages/claim/${aliceId}`,
        headers: bearer(bobToken),
      });
      expect(claim2.statusCode).toBe(200);
      expect(claim2.json().keyPackage).toBe("alice_kp_beta");

      // Terzo tentativo: i KeyPackage monouso sono esauriti (restituisce keyPackage null ma device public key)
      const claim3 = await app.inject({
        method: "GET",
        url: `/api/v1/dispositivi/key-packages/claim/${aliceId}`,
        headers: bearer(bobToken),
      });
      expect(claim3.statusCode).toBe(200);
      expect(claim3.json().keyPackage).toBeNull();
      expect(claim3.json().publicKey).toBe("pub_key_alice_main");

      // Alice rifornisce i KeyPackage
      const publishRes = await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/key-packages",
        headers: bearer(aliceToken),
        payload: {
          keyPackages: ["alice_kp_gamma"],
        },
      });
      expect(publishRes.statusCode).toBe(200);
      expect(publishRes.json().count).toBe(1);

      // Ora Bob può prelevare quello nuovo
      const claim4 = await app.inject({
        method: "GET",
        url: `/api/v1/dispositivi/key-packages/claim/${aliceId}`,
        headers: bearer(bobToken),
      });
      expect(claim4.statusCode).toBe(200);
      expect(claim4.json().keyPackage).toBe("alice_kp_gamma");
    });
  });

  it("salva e recupera il backup cifrato delle chiavi con passphrase", async () => {
    await withTestRig(async ({ app, aliceToken, bobToken }) => {
      // Alice prova a leggere il backup prima di averne uno: 404
      const notFound = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/backup",
        headers: bearer(aliceToken),
      });
      expect(notFound.statusCode).toBe(404);

      // Alice deposita il blob cifrato con passphrase
      const encryptedBlob = "ENCRYPTED_BLOB_BASE64_ABC123";
      const saveRes = await app.inject({
        method: "PUT",
        url: "/api/v1/dispositivi/backup",
        headers: bearer(aliceToken),
        payload: {
          encryptedBlob,
          algorithm: "AES-GCM-256",
          salt: "SALT_BASE64_987",
          iterations: 600000,
        },
      });
      expect(saveRes.statusCode).toBe(200);
      expect(saveRes.json().encryptedBlob).toBe(encryptedBlob);
      expect(saveRes.json().iterations).toBe(600000);
      expect(saveRes.json().updatedAt).toBeDefined();

      // Alice legge il proprio backup
      const getRes = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/backup",
        headers: bearer(aliceToken),
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().encryptedBlob).toBe(encryptedBlob);
      expect(getRes.json().algorithm).toBe("AES-GCM-256");

      // Bob non vede il backup di Alice (perché la rotta legge solo request.caller)
      const bobGetRes = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/backup",
        headers: bearer(bobToken),
      });
      expect(bobGetRes.statusCode).toBe(404);
    });
  });

  it("restituisce la chiave pubblica di un dispositivo dato il suo ID", async () => {
    await withTestRig(async ({ app, aliceToken, bobToken }) => {
      const reg = await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/chiave",
        headers: bearer(aliceToken),
        payload: {
          publicKey: "pub_key_alice_specific_device",
          algorithm: "ESTIA-E2E-v1",
        },
      });
      const deviceId = reg.json().device.id;

      // Bob può richiedere la chiave pubblica del dispositivo di Alice per verificare/ri-derivare
      const pubRes = await app.inject({
        method: "GET",
        url: `/api/v1/dispositivi/${deviceId}/chiave-pubblica`,
        headers: bearer(bobToken),
      });

      expect(pubRes.statusCode).toBe(200);
      expect(pubRes.json().deviceId).toBe(deviceId);
      expect(pubRes.json().publicKey).toBe("pub_key_alice_specific_device");
      expect(pubRes.json().algorithm).toBe("ESTIA-E2E-v1");

      // ID inesistente -> 404
      const notFound = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/00000000-0000-0000-0000-000000000000/chiave-pubblica",
        headers: bearer(bobToken),
      });
      expect(notFound.statusCode).toBe(404);
    });
  });

  it("richiede autenticazione per tutte le operazioni sui dispositivi", async () => {
    await withTestRig(async ({ app }) => {
      const res1 = await app.inject({
        method: "POST",
        url: "/api/v1/dispositivi/chiave",
        payload: { publicKey: "pk", algorithm: "algo" },
      });
      expect(res1.statusCode).toBe(401);

      const res2 = await app.inject({
        method: "GET",
        url: "/api/v1/dispositivi/backup",
      });
      expect(res2.statusCode).toBe(401);
    });
  });
});
