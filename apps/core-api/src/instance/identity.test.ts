import { createPrivateKey } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { InstanceEndpoint } from "../federation/endpoint.js";

import {
  createSetupToken,
  deriveNetworkPublicId,
  deriveNetworkSecretKey,
  loadOrCreateIdentity,
} from "./identity.js";

describe("instance identity", () => {
  it("generates a keypair on first boot and reuses it afterwards", async () => {
    await withTempDataDir(async (dataDir) => {
      const first = loadOrCreateIdentity(dataDir);
      const second = loadOrCreateIdentity(dataDir);

      // Members pin this key on first contact: it must never change (ADR 0003).
      expect(second.publicKey).toBe(first.publicKey);
      expect(second.privateKeyPem).toBe(first.privateKeyPem);
      expect(first.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  it("keeps the private key out of the database file and readable only by the owner", async () => {
    await withTempDataDir(async (dataDir) => {
      loadOrCreateIdentity(dataDir);

      const stats = statSync(path.join(dataDir, "instance-identity.pem"));
      expect(stats.mode & 0o777).toBe(0o600);
    });
  });

  it("produces distinct identities for distinct instances", async () => {
    await withTempDataDir(async (first) => {
      await withTempDataDir(async (second) => {
        expect(loadOrCreateIdentity(second).publicKey).not.toBe(
          loadOrCreateIdentity(first).publicKey,
        );
      });
    });
  });

  it("derives a network identity that survives a restart", async () => {
    await withTempDataDir(async (dataDir) => {
      // Two loads of the same instance are what a restart is: the transport key
      // has to come out the same, or every instance that saved this one's
      // address loses it (ADR 0018).
      const first = deriveNetworkSecretKey(loadOrCreateIdentity(dataDir));
      const second = deriveNetworkSecretKey(loadOrCreateIdentity(dataDir));

      expect(second).toEqual(first);
      expect(first).toHaveLength(32);
    });
  });

  it("keeps the network key separate from the key it is derived from", async () => {
    await withTempDataDir(async (dataDir) => {
      const identity = loadOrCreateIdentity(dataDir);
      const seed = Buffer.from(
        createPrivateKey(identity.privateKeyPem).export({ format: "jwk" }).d ?? "",
        "base64url",
      );

      // Same length, deliberately different material: one signs at the
      // application level, the other is the QUIC handshake identity.
      expect(seed).toHaveLength(32);
      expect(Buffer.from(deriveNetworkSecretKey(identity)).equals(seed)).toBe(false);
    });
  });

  it("gives distinct instances distinct network identities", async () => {
    await withTempDataDir(async (first) => {
      await withTempDataDir(async (second) => {
        expect(deriveNetworkSecretKey(loadOrCreateIdentity(second))).not.toEqual(
          deriveNetworkSecretKey(loadOrCreateIdentity(first)),
        );
      });
    });
  });

  it("produces unpredictable setup tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createSetupToken()));

    expect(tokens.size).toBe(50);
    expect([...tokens][0]).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
});

describe("la chiave della casa", () => {
  it("è la stessa che iroh stampa quando il socket si apre davvero", async () => {
    await withTempDataDir(async (dataDir) => {
      const identity = loadOrCreateIdentity(dataDir);
      const endpoint = new InstanceEndpoint(deriveNetworkSecretKey(identity));

      await endpoint.open("local");

      try {
        // Se questa fallisce non è una sottigliezza di formato: vuol dire che le
        // credenziali MLS porterebbero un nome di casa che la rete non riconosce.
        expect(endpoint.endpointId).toBe(deriveNetworkPublicId(identity));
      } finally {
        await endpoint.close();
      }
    });
  });

  it("si sa prima di aprire il socket, e non cambia", async () => {
    await withTempDataDir(async (dataDir) => {
      const identity = loadOrCreateIdentity(dataDir);

      expect(deriveNetworkPublicId(identity)).toBe(deriveNetworkPublicId(identity));
      expect(deriveNetworkPublicId(identity)).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
