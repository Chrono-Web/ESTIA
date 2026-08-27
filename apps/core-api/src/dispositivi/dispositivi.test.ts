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

/**
 * L'approvazione di un dispositivo ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)).
 *
 * La porta che conta qui è il prelievo: chi scrive riceve la chiave del
 * dispositivo **più recente**, quindi prima del 2026-08-27 un secondo
 * dispositivo che entrava si prendeva la ricezione e il primo smetteva di
 * ricevere restando collegato. Adesso il secondo aspetta, e il primo continua.
 */
describe("un dispositivo nuovo aspetta un sì", () => {
  it("il secondo dispositivo non ruba la ricezione al primo", async () => {
    await withTestRig(async ({ app, aliceToken, aliceId, bobToken }) => {
      await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_COMPUTER_DI_ALICE" },
        url: "/api/v1/dispositivi/chiave",
      });

      // Alice apre ESTIA dal telefono: sessione nuova, chiave nuova.
      const telefono = await app.identityService.login({
        password: "password-lunga-alice",
        username: "alice",
      });
      await app.inject({
        headers: bearer(telefono.token),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_TELEFONO_DI_ALICE" },
        url: "/api/v1/dispositivi/chiave",
      });

      const preso = await app.inject({
        headers: bearer(bobToken),
        method: "GET",
        url: `/api/v1/dispositivi/key-packages/claim/${aliceId}`,
      });

      expect(preso.statusCode).toBe(200);
      expect(preso.json().publicKey).toBe("IL_COMPUTER_DI_ALICE");
    });
  });

  it("il dispositivo in attesa si vede nell'elenco, con lo stato", async () => {
    // Serve a poterlo approvare: una richiesta che non si vede non è una
    // richiesta (euristica 6).
    await withTestRig(async ({ app, aliceToken, aliceId }) => {
      await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_COMPUTER_DI_ALICE" },
        url: "/api/v1/dispositivi/chiave",
      });

      const telefono = await app.identityService.login({
        password: "password-lunga-alice",
        username: "alice",
      });
      await app.inject({
        headers: bearer(telefono.token),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_TELEFONO_DI_ALICE" },
        url: "/api/v1/dispositivi/chiave",
      });

      const elenco = app.dispositiviService.listUserDevices(aliceId);
      const perChiave = new Map(elenco.map((d) => [d.publicKey, d.approvatoIl]));

      expect(perChiave.get("IL_COMPUTER_DI_ALICE")).not.toBeNull();
      expect(perChiave.get("IL_TELEFONO_DI_ALICE")).toBeNull();
    });
  });

  it("riregistrarsi non trasforma un'attesa in un sì", async () => {
    // Sarebbe la strada C per la porta di servizio: basterebbe ripetere la
    // chiamata finché non passa.
    await withTestRig(async ({ app, aliceToken, aliceId }) => {
      await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_COMPUTER_DI_ALICE" },
        url: "/api/v1/dispositivi/chiave",
      });

      const telefono = await app.identityService.login({
        password: "password-lunga-alice",
        username: "alice",
      });
      for (let i = 0; i < 3; i++) {
        await app.inject({
          headers: bearer(telefono.token),
          method: "POST",
          payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_TELEFONO_DI_ALICE" },
          url: "/api/v1/dispositivi/chiave",
        });
      }

      const inAttesa = app.dispositiviService
        .listUserDevices(aliceId)
        .find((d) => d.publicKey === "IL_TELEFONO_DI_ALICE");

      expect(inAttesa?.approvatoIl).toBeNull();
    });
  });
});

describe("dire di sì, e dire di no", () => {
  /** Alice sul computer (approvato da solo), poi dal telefono (in attesa). */
  async function conDueDispositivi(app: FastifyInstance, aliceToken: string, aliceId: string) {
    await app.inject({
      headers: bearer(aliceToken),
      method: "POST",
      payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_COMPUTER_DI_ALICE" },
      url: "/api/v1/dispositivi/chiave",
    });

    const telefono = await app.identityService.login({
      password: "password-lunga-alice",
      username: "alice",
    });
    await app.inject({
      headers: bearer(telefono.token),
      method: "POST",
      payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_TELEFONO_DI_ALICE" },
      url: "/api/v1/dispositivi/chiave",
    });

    const elenco = app.dispositiviService.listUserDevices(aliceId);
    return {
      telefono,
      idTelefono: elenco.find((d) => d.publicKey === "IL_TELEFONO_DI_ALICE")!.id,
    };
  }

  it("dopo il sì il dispositivo entra nel registro e può ricevere", async () => {
    await withTestRig(async ({ app, aliceToken, aliceId, bobToken }) => {
      const { idTelefono } = await conDueDispositivi(app, aliceToken, aliceId);

      const esito = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        url: `/api/v1/dispositivi/${idTelefono}/approva`,
      });

      expect(esito.statusCode).toBe(200);
      expect(esito.json().device.approvatoIl).not.toBeNull();

      // Il telefono è il più recente: adesso è lui a ricevere.
      const preso = await app.inject({
        headers: bearer(bobToken),
        method: "GET",
        url: `/api/v1/dispositivi/key-packages/claim/${aliceId}`,
      });
      expect(preso.json().publicKey).toBe("IL_TELEFONO_DI_ALICE");
    });
  });

  it("un dispositivo in attesa NON può approvare sé stesso", async () => {
    // È l'attacco diretto: se passasse, la strada B sarebbe la strada C con un
    // passaggio in più.
    await withTestRig(async ({ app, aliceToken, aliceId }) => {
      const { telefono, idTelefono } = await conDueDispositivi(app, aliceToken, aliceId);

      const esito = await app.inject({
        headers: bearer(telefono.token),
        method: "POST",
        url: `/api/v1/dispositivi/${idTelefono}/approva`,
      });

      expect(esito.statusCode).toBe(403);
      expect(app.dispositiviService.listUserDevices(aliceId)).toContainEqual(
        expect.objectContaining({ approvatoIl: null, publicKey: "IL_TELEFONO_DI_ALICE" }),
      );
    });
  });

  it("il dispositivo di un altro non si approva, e non si impara che esiste", async () => {
    await withTestRig(async ({ app, aliceToken, aliceId, bobToken, bobId }) => {
      await app.inject({
        headers: bearer(bobToken),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_COMPUTER_DI_BOB" },
        url: "/api/v1/dispositivi/chiave",
      });
      await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        payload: { algorithm: "ESTIA-E2E-v1", publicKey: "IL_COMPUTER_DI_ALICE" },
        url: "/api/v1/dispositivi/chiave",
      });
      void aliceId;

      const diBob = app.dispositiviService.listUserDevices(bobId)[0]!;
      const esito = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        url: `/api/v1/dispositivi/${diBob.id}/approva`,
      });

      // 404 e non 403: «non è tuo» e «non esiste» si dicono uguale.
      expect(esito.statusCode).toBe(404);
    });
  });

  it("il no porta via la chiave e anche la sessione", async () => {
    // Un «no» che lasciasse quel browser collegato sarebbe una domanda che
    // ricompare.
    await withTestRig(async ({ app, aliceToken, aliceId }) => {
      const { telefono, idTelefono } = await conDueDispositivi(app, aliceToken, aliceId);

      const esito = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        url: `/api/v1/dispositivi/${idTelefono}/rifiuta`,
      });
      expect(esito.statusCode).toBe(200);

      // La sessione di quel browser non vale più.
      const conIlVecchioToken = await app.inject({
        headers: bearer(telefono.token),
        method: "GET",
        url: "/api/v1/dispositivi",
      });
      expect(conIlVecchioToken.statusCode).toBe(401);

      expect(app.dispositiviService.listUserDevices(aliceId).map((d) => d.publicKey)).toEqual([
        "IL_COMPUTER_DI_ALICE",
      ]);
    });
  });

  it("dire di sì due volte non cambia niente", async () => {
    await withTestRig(async ({ app, aliceToken, aliceId }) => {
      const { idTelefono } = await conDueDispositivi(app, aliceToken, aliceId);

      const primo = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        url: `/api/v1/dispositivi/${idTelefono}/approva`,
      });
      const secondo = await app.inject({
        headers: bearer(aliceToken),
        method: "POST",
        url: `/api/v1/dispositivi/${idTelefono}/approva`,
      });

      expect(secondo.statusCode).toBe(200);
      expect(secondo.json().device.approvatoIl).toBe(primo.json().device.approvatoIl);
    });
  });

  it("l'elenco porta i dispositivi in attesa, o non si potrebbero autorizzare", async () => {
    await withTestRig(async ({ app, aliceToken, aliceId }) => {
      await conDueDispositivi(app, aliceToken, aliceId);

      const elenco = await app.inject({
        headers: bearer(aliceToken),
        method: "GET",
        url: "/api/v1/dispositivi",
      });

      const chiavi = (elenco.json().dispositivi as { publicKey: string }[]).map((d) => d.publicKey);
      expect(chiavi.sort()).toEqual(["IL_COMPUTER_DI_ALICE", "IL_TELEFONO_DI_ALICE"]);
    });
  });
});
