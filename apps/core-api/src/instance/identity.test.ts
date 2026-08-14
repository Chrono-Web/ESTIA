import { statSync } from "node:fs";
import path from "node:path";

import { withTempDataDir } from "@estia/testing";
import { describe, expect, it } from "vitest";

import { createSetupToken, loadOrCreateIdentity } from "./identity.js";

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

  it("produces unpredictable setup tokens", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createSetupToken()));

    expect(tokens.size).toBe(50);
    expect([...tokens][0]).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });
});
