import type { DeviceKeyView, KeyBackupView } from "@estia/contracts";
import { api } from "./api.js";

const DB_NAME = "estia_crypto_v1";
const STORE_NAME = "device_identity";
const KEY_NAME = "local_device_keypair";
const BACKUP_KDF_ITERATIONS = 600000;

function openCryptoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile in questo ambiente."));
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

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openCryptoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbGetAllConvKeys(): Promise<Record<string, JsonWebKey>> {
  const db = await openCryptoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conv_keys", "readonly");
    const store = tx.objectStore("conv_keys");
    const req = store.getAll();
    const reqKeys = store.getAllKeys();

    tx.oncomplete = () => {
      const keys = reqKeys.result as string[];
      const values = req.result as JsonWebKey[];
      const res: Record<string, JsonWebKey> = {};
      for (let i = 0; i < keys.length; i++) {
        res[keys[i]!] = values[i]!;
      }
      resolve(res);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbSetAllConvKeys(keys: Record<string, JsonWebKey>): Promise<void> {
  const db = await openCryptoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("conv_keys", "readwrite");
    const store = tx.objectStore("conv_keys");
    for (const [k, v] of Object.entries(keys)) {
      store.put(v, k);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openCryptoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openCryptoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export interface StoredDeviceIdentity {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  ecdhPublicKeyJwk?: JsonWebKey;
  ecdhPrivateKeyJwk?: JsonWebKey;
  publicKeyBase64: string; // JSON { sig: string, kx: string } in Base64
  algorithm: string;
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

/**
 * Controlla se il dispositivo possiede già una propria identità crittografica.
 */
export async function hasLocalDeviceIdentity(): Promise<boolean> {
  const stored = await idbGet<StoredDeviceIdentity>(KEY_NAME);
  return stored !== undefined;
}

export async function getLocalDeviceIdentity(): Promise<StoredDeviceIdentity | undefined> {
  return await idbGet<StoredDeviceIdentity>(KEY_NAME);
}

/**
 * Inizializza o recupera l'identità crittografica del dispositivo locale.
 * Se non esiste, genera una coppia ECDSA P-256 e una ECDH P-256 e le registra sul server.
 */
export async function initializeDeviceIdentity(token: string): Promise<{
  identity: StoredDeviceIdentity;
  device: DeviceKeyView;
}> {
  let stored = await idbGet<StoredDeviceIdentity>(KEY_NAME);

  if (!stored) {
    if (!window.crypto?.subtle) {
      throw new Error(
        "WebCrypto API non disponibile. È necessaria una connessione sicura (HTTPS o localhost).",
      );
    }

    // Genera nuova coppia di chiavi ECDSA per la firma
    const sigKeyPair = await window.crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );

    // Genera nuova coppia di chiavi ECDH per lo scambio chiavi
    const kxKeyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"],
    );

    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", sigKeyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", sigKeyPair.privateKey);
    const sigSpki = await window.crypto.subtle.exportKey("spki", sigKeyPair.publicKey);

    const ecdhPublicKeyJwk = await window.crypto.subtle.exportKey("jwk", kxKeyPair.publicKey);
    const ecdhPrivateKeyJwk = await window.crypto.subtle.exportKey("jwk", kxKeyPair.privateKey);
    const kxSpki = await window.crypto.subtle.exportKey("spki", kxKeyPair.publicKey);

    const payload = JSON.stringify({
      sig: bufferToBase64(sigSpki),
      kx: bufferToBase64(kxSpki),
    });
    const publicKeyBase64 = btoa(payload);

    stored = {
      publicKeyJwk,
      privateKeyJwk,
      ecdhPublicKeyJwk,
      ecdhPrivateKeyJwk,
      publicKeyBase64,
      algorithm: "ESTIA-E2E-v1",
    };

    await idbSet(KEY_NAME, stored);
  }

  // Se è un vecchio account (Fase 0/1) che aveva ECDSA-P256, il server lo accetta,
  // ma noi useremo "ESTIA-E2E-v1" per i nuovi.
  const reg = await api.registerDeviceKey(token, {
    publicKey: stored.publicKeyBase64,
    algorithm: stored.algorithm,
  });

  return {
    identity: stored,
    device: reg.device,
  };
}

/**
 * Rimuove le chiavi del dispositivo locale da IndexedDB al logout.
 */
export async function clearLocalDeviceIdentity(): Promise<void> {
  try {
    await idbDelete(KEY_NAME);
  } catch {
    // Silenzioso se IndexedDB non è aperto
  }
}

/**
 * Cifra e carica il backup delle chiavi personali sul server tramite passphrase.
 */
export async function createAndSaveKeyBackup(
  token: string,
  passphrase: string,
): Promise<KeyBackupView> {
  const stored = await idbGet<StoredDeviceIdentity>(KEY_NAME);
  if (!stored) {
    throw new Error("Nessuna chiave dispositivo trovata localmente.");
  }

  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));

  // Deriva la chiave di cifratura tramite PBKDF2
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: BACKUP_KDF_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const convKeys = await idbGetAllConvKeys();
  const payloadText = JSON.stringify({
    identity: stored,
    conv_keys: convKeys,
    createdAt: new Date().toISOString(),
  });

  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    enc.encode(payloadText),
  );

  // Combina IV + Encrypted Data in base64
  const combined = new Uint8Array(ivBytes.byteLength + encryptedBuf.byteLength);
  combined.set(ivBytes, 0);
  combined.set(new Uint8Array(encryptedBuf), ivBytes.byteLength);

  return api.saveKeyBackup(token, {
    encryptedBlob: bufferToBase64(combined.buffer),
    algorithm: "PBKDF2-AES-GCM-256",
    salt: bufferToBase64(saltBytes.buffer),
    iterations: BACKUP_KDF_ITERATIONS,
  });
}

/**
 * Ripristina le chiavi personali da un backup cifrato presente sul server tramite passphrase.
 */
export async function restoreKeyBackup(
  token: string,
  passphrase: string,
): Promise<StoredDeviceIdentity> {
  const backup = await api.getKeyBackup(token);
  if (!backup) {
    throw new Error("Nessun backup trovato sul server.");
  }

  const saltBuf = base64ToBuffer(backup.salt);
  const combinedBuf = base64ToBuffer(backup.encryptedBlob);
  const combinedBytes = new Uint8Array(combinedBuf);

  if (combinedBytes.byteLength < 12) {
    throw new Error("Formato backup non valido.");
  }

  const ivBytes = combinedBytes.slice(0, 12);
  const encryptedBytes = combinedBytes.slice(12);

  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf,
      iterations: backup.iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      aesKey,
      encryptedBytes,
    );
  } catch {
    throw new Error("Passphrase non corretta o backup corrotto.");
  }

  const dec = new TextDecoder();
  const payload = JSON.parse(dec.decode(decryptedBuf)) as {
    identity: StoredDeviceIdentity;
    conv_keys?: Record<string, JsonWebKey>;
  };

  await idbSet(KEY_NAME, payload.identity);
  if (payload.conv_keys) {
    await idbSetAllConvKeys(payload.conv_keys);
  }

  // Registra la chiave ripristinata anche per la sessione corrente
  await api.registerDeviceKey(token, {
    publicKey: payload.identity.publicKeyBase64,
    algorithm: payload.identity.algorithm,
  });

  return payload.identity;
}
