import type { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

type CryptoKey = webcrypto.CryptoKey;

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

interface MessagePayload {
  v: 1;
  text: string;
  replyTo?: string;
}

async function generateEcdhKeyPair() {
  return globalThis.crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
    "deriveBits",
  ]);
}

async function deriveConversationKey(
  peerPublicKeySpki: ArrayBuffer,
  localPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const peerPublicKey = await globalThis.crypto.subtle.importKey(
    "spki",
    peerPublicKeySpki,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    localPrivateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

async function encryptMessage(payload: MessagePayload, key: CryptoKey): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payload));

  const encryptedBuf = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBytes,
  );

  const combined = new Uint8Array(iv.byteLength + encryptedBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuf), iv.byteLength);

  return bufferToBase64(combined.buffer);
}

async function decryptMessage(bustaBase64: string, key: CryptoKey): Promise<MessagePayload | null> {
  try {
    const combinedBuf = base64ToBuffer(bustaBase64);
    const combinedBytes = new Uint8Array(combinedBuf);

    if (combinedBytes.byteLength < 12) return null;

    const iv = combinedBytes.slice(0, 12);
    const ciphertext = combinedBytes.slice(12);

    const decryptedBuf = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    const dec = new TextDecoder();
    const rawText = dec.decode(decryptedBuf);
    return JSON.parse(rawText) as MessagePayload;
  } catch {
    return null;
  }
}

describe("E2E WebCrypto e ri-derivazione chiavi di conversazione (M6)", () => {
  it("esegue roundtrip completo di cifratura e decifratura tra due dispositivi", async () => {
    const aliceKeys = await generateEcdhKeyPair();
    const bobKeys = await generateEcdhKeyPair();

    const aliceSpki = await globalThis.crypto.subtle.exportKey("spki", aliceKeys.publicKey);
    const bobSpki = await globalThis.crypto.subtle.exportKey("spki", bobKeys.publicKey);

    // Alice deriva la chiave per la conversazione con Bob
    const aliceConvKey = await deriveConversationKey(bobSpki, aliceKeys.privateKey);

    // Bob deriva la chiave per la conversazione con Alice
    const bobConvKey = await deriveConversationKey(aliceSpki, bobKeys.privateKey);

    // Alice cifra un messaggio
    const payload: MessagePayload = { v: 1, text: "Ciao Bob, questo è un messaggio E2E!" };
    const busta = await encryptMessage(payload, aliceConvKey);

    // Bob decifra con successo
    const decryptedByBob = await decryptMessage(busta, bobConvKey);
    expect(decryptedByBob).not.toBeNull();
    expect(decryptedByBob?.text).toBe("Ciao Bob, questo è un messaggio E2E!");

    // Bob risponde
    const replyPayload: MessagePayload = { v: 1, text: "Ricevuto forte e chiaro Alice!" };
    const replyBusta = await encryptMessage(replyPayload, bobConvKey);

    // Alice decifra la risposta
    const decryptedByAlice = await decryptMessage(replyBusta, aliceConvKey);
    expect(decryptedByAlice).not.toBeNull();
    expect(decryptedByAlice?.text).toBe("Ricevuto forte e chiaro Alice!");
  });

  it("gestisce la ri-derivazione quando un utente registra un nuovo dispositivo", async () => {
    // Sessione 1: Alice (Device 1) e Bob (Device 1)
    const aliceDev1 = await generateEcdhKeyPair();
    const bobDev1 = await generateEcdhKeyPair();

    const alice1Spki = await globalThis.crypto.subtle.exportKey("spki", aliceDev1.publicKey);
    const bob1Spki = await globalThis.crypto.subtle.exportKey("spki", bobDev1.publicKey);

    const aliceKey1 = await deriveConversationKey(bob1Spki, aliceDev1.privateKey);
    const bobKey1 = await deriveConversationKey(alice1Spki, bobDev1.privateKey);

    // Alice invia messaggio 1
    const busta1 = await encryptMessage({ v: 1, text: "Messaggio 1 su Device 1" }, aliceKey1);
    expect((await decryptMessage(busta1, bobKey1))?.text).toBe("Messaggio 1 su Device 1");

    // Bob cambia browser/dispositivo e registra Device 2 (nuova coppia ECDH)
    const bobDev2 = await generateEcdhKeyPair();
    const bob2Spki = await globalThis.crypto.subtle.exportKey("spki", bobDev2.publicKey);

    // Bob Dev2 con la sua nuova chiave privata prova a decifrare il vecchio messaggio con chiave derivata da Dev2
    const bobKey2WithOldAlice = await deriveConversationKey(alice1Spki, bobDev2.privateKey);
    const failOld = await decryptMessage(busta1, bobKey2WithOldAlice);
    // Deve fallire perché busta1 era cifrata per Bob Dev1 (serve ripristino backup)
    expect(failOld).toBeNull();

    // Alice ri-deriva la chiave attiva per la conversazione appena rileva il nuovo dispositivo di Bob
    const aliceKey2 = await deriveConversationKey(bob2Spki, aliceDev1.privateKey);

    // Alice invia messaggio 2 con la nuova chiave derivata
    const busta2 = await encryptMessage({ v: 1, text: "Messaggio 2 per Device 2" }, aliceKey2);

    // Bob Dev2 decifra con successo con la sua chiave derivata da Alice Dev1
    const decrypted2 = await decryptMessage(busta2, bobKey2WithOldAlice);
    expect(decrypted2).not.toBeNull();
    expect(decrypted2?.text).toBe("Messaggio 2 per Device 2");
  });
});
