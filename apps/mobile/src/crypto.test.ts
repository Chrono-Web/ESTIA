import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

import { p256 } from "@noble/curves/nist.js";
import { randomBytes } from "@noble/hashes/utils.js";

import {
  base64ToBytes,
  bytesToBase64,
  decryptMessageBody,
  deriveSharedKey,
  encryptMessageBody,
  type MessagePayload,
} from "./crypto";

describe("Mobile Native Crypto (ESTIA-E2E-v1)", () => {
  it("converte bytes in Base64 e viceversa senza corruzioni", () => {
    const raw = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const b64 = bytesToBase64(raw);
    const roundtrip = base64ToBytes(b64);
    expect(roundtrip).toEqual(raw);
  });

  it("deriva la stessa chiave simmetrica tra due peer tramite ECDH P-256", () => {
    const peer1 = p256.keygen();
    const peer1Pub65 = p256.getPublicKey(peer1.secretKey, false);

    const peer2 = p256.keygen();
    const peer2Pub65 = p256.getPublicKey(peer2.secretKey, false);

    const P256_SPKI_HEADER = new Uint8Array([
      0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
      0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
    ]);

    const peer1Spki = new Uint8Array(P256_SPKI_HEADER.length + 65);
    peer1Spki.set(P256_SPKI_HEADER, 0);
    peer1Spki.set(peer1Pub65, P256_SPKI_HEADER.length);

    const peer2Spki = new Uint8Array(P256_SPKI_HEADER.length + 65);
    peer2Spki.set(P256_SPKI_HEADER, 0);
    peer2Spki.set(peer2Pub65, P256_SPKI_HEADER.length);

    const key1 = deriveSharedKey(peer1Spki, peer2.secretKey);
    const key2 = deriveSharedKey(peer2Spki, peer1.secretKey);

    expect(key1).toEqual(key2);
    expect(key1.length).toBe(32);
  });

  it("cifra e decifra un messaggio con payload strutturato", () => {
    const key = randomBytes(32);
    const payload: MessagePayload = { text: "Messaggio privato da iPhone!", v: 1 };

    const busta = encryptMessageBody(payload, key);
    const decifrato = decryptMessageBody(busta, key);

    expect(decifrato.v).toBe(1);
    expect(decifrato.text).toBe("Messaggio privato da iPhone!");
  });

  it("interopera con WebCrypto W3C: cifra con WebCrypto, decifra con mobile", async () => {
    const webKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", webKey));

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ text: "Messaggio scritto da browser", v: 1 }),
    );
    const encryptedBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, webKey, plaintext);

    const combined = new Uint8Array(iv.length + encryptedBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuf), iv.length);
    const bustaBase64 = Buffer.from(combined).toString("base64");

    const decifrato = decryptMessageBody(bustaBase64, rawKey);
    expect(decifrato.text).toBe("Messaggio scritto da browser");
  });

  it("interopera con WebCrypto W3C: cifra con mobile, decifra con WebCrypto", async () => {
    const rawKey = randomBytes(32);
    const payload: MessagePayload = { text: "Messaggio scritto da iPhone", v: 1 };

    const bustaBase64 = encryptMessageBody(payload, rawKey);

    const webKey = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );

    const combined = Buffer.from(bustaBase64, "base64");
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);

    const decryptedBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, webKey, ciphertext);
    const parsed = JSON.parse(new TextDecoder().decode(decryptedBuf)) as MessagePayload;

    expect(parsed.text).toBe("Messaggio scritto da iPhone");
  });
});
