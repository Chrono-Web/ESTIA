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

export interface StoredConvKeyRecord {
  jwk: JsonWebKey;
  peerDeviceId?: string;
  localDeviceId?: string;
  updatedAt?: string;
}

export async function getStoredConvKeyRecord(
  conversazioneId: string,
): Promise<StoredConvKeyRecord | undefined> {
  const db = await openConvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(conversazioneId);
    req.onsuccess = () => {
      const res = req.result;
      if (!res) {
        resolve(undefined);
        return;
      }
      if ("jwk" in res && res.jwk) {
        resolve(res as StoredConvKeyRecord);
      } else {
        resolve({ jwk: res as JsonWebKey });
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function setStoredConvKeyRecord(
  conversazioneId: string,
  record: StoredConvKeyRecord,
): Promise<void> {
  const db = await openConvDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record, conversazioneId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
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
 * Estrae l'SPKI della chiave pubblica ECDH (campo 'kx') dal payload Base64.
 */
export function extractPeerKxSpki(publicKeyBase64: string): ArrayBuffer {
  try {
    const parsed = JSON.parse(atob(publicKeyBase64));
    if (parsed.kx) {
      return base64ToBuffer(parsed.kx);
    }
  } catch {
    // Fallback se la stringa era già direttamente SPKI in Base64
  }
  return base64ToBuffer(publicKeyBase64);
}

/**
 * Deriva una chiave simmetrica AES-GCM-256 tramite ECDH con la chiave pubblica del peer
 * e la chiave privata locale ECDH.
 */
export async function deriveKeyFromPeerKx(
  peerSpki: ArrayBuffer,
  localEcdhPrivateKeyJwk: JsonWebKey,
): Promise<CryptoKey> {
  if (!window.crypto?.subtle) {
    throw new Error("WebCrypto API non disponibile.");
  }

  const peerPublicKey = await window.crypto.subtle.importKey(
    "spki",
    peerSpki,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  const myPrivateKey = await window.crypto.subtle.importKey(
    "jwk",
    localEcdhPrivateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * Ottiene la chiave AES-GCM-256 per la conversazione specificata.
 * Se non esiste in cache, la deriva tramite ECDH con la chiave del dispositivo del peer.
 */
export async function getOrCreateConversationKey(
  conversazioneId: string,
  peerUserId: string,
  token: string,
): Promise<CryptoKey> {
  const stored = await getStoredConvKeyRecord(conversazioneId);

  if (stored?.jwk) {
    return window.crypto.subtle.importKey(
      "jwk",
      stored.jwk,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
  }

  return rederiveConversationKey(conversazioneId, peerUserId, token);
}

/**
 * Ri-deriva la chiave di conversazione usando la chiave del dispositivo attivo del peer
 * (o di uno specifico dispositivo se indicato) e aggiorna la cache locale.
 */
export async function rederiveConversationKey(
  conversazioneId: string,
  peerUserId: string,
  token: string,
  specificPeerDeviceId?: string,
): Promise<CryptoKey> {
  if (!window.crypto?.subtle) {
    throw new Error("WebCrypto API non disponibile.");
  }

  let peerPublicKeyB64: string;
  let peerDeviceId: string;

  if (specificPeerDeviceId) {
    const dev = await api.getDevicePublicKey(token, specificPeerDeviceId);
    peerPublicKeyB64 = dev.publicKey;
    peerDeviceId = dev.deviceId;
  } else {
    const pkg = await api.claimKeyPackage(token, peerUserId);
    peerPublicKeyB64 = pkg.publicKey;
    peerDeviceId = pkg.deviceId;
  }

  const peerSpki = extractPeerKxSpki(peerPublicKeyB64);
  const localId = await getLocalDeviceIdentity();
  if (!localId || !localId.ecdhPrivateKeyJwk) {
    throw new Error(
      "Il tuo dispositivo non possiede chiavi crittografiche E2E. Esegui nuovamente il login.",
    );
  }

  const derivedKey = await deriveKeyFromPeerKx(peerSpki, localId.ecdhPrivateKeyJwk);
  const exported = await window.crypto.subtle.exportKey("jwk", derivedKey);

  await setStoredConvKeyRecord(conversazioneId, {
    jwk: exported,
    peerDeviceId,
    updatedAt: new Date().toISOString(),
  });

  return derivedKey;
}

/**
 * Deriva una chiave AES-GCM al volo per un dispositivo specifico (senza sovrascrivere
 * necessariamente la chiave principale della conversazione).
 */
export async function deriveKeyForDevice(peerDeviceId: string, token: string): Promise<CryptoKey> {
  if (!window.crypto?.subtle) {
    throw new Error("WebCrypto API non disponibile.");
  }

  const dev = await api.getDevicePublicKey(token, peerDeviceId);
  const peerSpki = extractPeerKxSpki(dev.publicKey);
  const localId = await getLocalDeviceIdentity();
  if (!localId || !localId.ecdhPrivateKeyJwk) {
    throw new Error("Il tuo dispositivo non possiede chiavi crittografiche E2E.");
  }

  return deriveKeyFromPeerKx(peerSpki, localId.ecdhPrivateKeyJwk);
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
 * Tenta di decifrare una busta Base64 per estrarre il payload strutturato.
 * Ritorna null se la decifratura fallisce (es. chiave errata o busta non valida).
 */
export async function tryDecryptMessageBody(
  bustaBase64: string,
  key: CryptoKey,
): Promise<MessagePayload | null> {
  if (!window.crypto?.subtle) {
    throw new Error(
      "WebCrypto API non disponibile. È necessaria una connessione sicura (HTTPS o localhost).",
    );
  }

  try {
    const combinedBuf = base64ToBuffer(bustaBase64);
    const combinedBytes = new Uint8Array(combinedBuf);

    if (combinedBytes.byteLength < 12) {
      return null;
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
    return null;
  }
}

/**
 * Decifra una busta Base64 per estrarre il payload strutturato.
 */
export async function decryptMessageBody(
  bustaBase64: string,
  key: CryptoKey,
): Promise<MessagePayload> {
  const res = await tryDecryptMessageBody(bustaBase64, key);
  if (res) return res;
  return { v: 1, text: "[Errore di decifrazione]" };
}
