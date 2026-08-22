const DB_NAME = "estia_crypto_v1";
const STORE_NAME = "conv_keys";

function openConvDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("device_identity")) {
        db.createObjectStore("device_identity");
      }
      if (!db.objectStoreNames.contains("conv_keys")) {
        db.createObjectStore("conv_keys");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredConvKey(conversazioneId: string): Promise<JsonWebKey | undefined> {
  const db = await openConvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(conversazioneId);
    req.onsuccess = () => resolve(req.result as JsonWebKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function setStoredConvKey(conversazioneId: string, jwk: JsonWebKey): Promise<void> {
  const db = await openConvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(jwk, conversazioneId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

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

import { getLocalDeviceIdentity } from "../dispositivo.js";
import { api } from "../api.js";

/**
 * Ottiene la chiave AES-GCM-256 per la conversazione specificata.
 * Se non esiste, la deriva tramite ECDH con la chiave del dispositivo del peer.
 */
export async function getOrCreateConversationKey(
  conversazioneId: string,
  peerUserId: string,
  token: string,
): Promise<CryptoKey> {
  const storedJwk = await getStoredConvKey(conversazioneId);

  if (storedJwk) {
    return window.crypto.subtle.importKey(
      "jwk",
      storedJwk,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  if (!window.crypto?.subtle) {
    throw new Error("WebCrypto API non disponibile.");
  }

  // Preleva la chiave pubblica del peer
  const pkg = await api.claimKeyPackage(token, peerUserId);
  let kxBase64: string;
  try {
    const parsed = JSON.parse(atob(pkg.publicKey));
    kxBase64 = parsed.kx;
    if (!kxBase64) throw new Error("Missing kx");
  } catch {
    throw new Error("Il dispositivo dell'interlocutore non supporta ECDH (E2E v1).");
  }

  const peerSpki = base64ToBuffer(kxBase64);
  const peerPublicKey = await window.crypto.subtle.importKey(
    "spki",
    peerSpki,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  const localId = await getLocalDeviceIdentity();
  if (!localId || !localId.ecdhPrivateKeyJwk) {
    throw new Error("Il tuo dispositivo non supporta ECDH. Esegui nuovamente il login.");
  }

  const myPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    localId.ecdhPrivateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"],
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const exported = await window.crypto.subtle.exportKey("jwk", derivedKey);
  await setStoredConvKey(conversazioneId, exported);

  return derivedKey;
}

export interface MessagePayload {
  v: 1;
  text: string;
  replyTo?: string;
}

/**
 * Cifra un messaggio producendo una busta Base64 [IV 12B + Ciphertext + Tag 16B].
 */
export async function encryptMessageBody(payload: MessagePayload, key: CryptoKey): Promise<string> {
  if (!window.crypto?.subtle) {
    throw new Error(
      "WebCrypto API non disponibile. È necessaria una connessione sicura (HTTPS o localhost).",
    );
  }

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(JSON.stringify(payload));

  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBytes,
  );

  const combined = new Uint8Array(iv.byteLength + encryptedBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuf), iv.byteLength);

  return bufferToBase64(combined.buffer);
}

/**
 * Decifra una busta Base64 per estrarre il payload strutturato.
 */
export async function decryptMessageBody(
  bustaBase64: string,
  key: CryptoKey,
): Promise<MessagePayload> {
  if (!window.crypto?.subtle) {
    throw new Error(
      "WebCrypto API non disponibile. È necessaria una connessione sicura (HTTPS o localhost).",
    );
  }

  try {
    const combinedBuf = base64ToBuffer(bustaBase64);
    const combinedBytes = new Uint8Array(combinedBuf);

    if (combinedBytes.byteLength < 12) {
      return { v: 1, text: "[Busta non valida o corrotta]" };
    }

    const iv = combinedBytes.slice(0, 12);
    const ciphertext = combinedBytes.slice(12);

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    const dec = new TextDecoder();
    const rawText = dec.decode(decryptedBuf);

    if (rawText.startsWith("{")) {
      try {
        const payload = JSON.parse(rawText);
        if (payload.v === 1 && typeof payload.text === "string") {
          return payload as MessagePayload;
        }
      } catch {
        // Fallback al testo grezzo se il JSON è invalido.
      }
    }

    return { v: 1, text: rawText };
  } catch {
    return { v: 1, text: "[Errore di decifrazione]" };
  }
}
