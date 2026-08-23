import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import * as SecureStore from "expo-secure-store";

import type { EstiaApi } from "./api";

const K_IDENTITY = "estia.crypto.identity";
const K_CONV_PREFIX = "estia.crypto.conv.";
const BACKUP_KDF_ITERATIONS = 600000;

// Standard ASN.1 DER Header for NIST P-256 SPKI (26 bytes)
const P256_SPKI_HEADER = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a,
  0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < len ? bytes[i + 1]! : 0;
    const b2 = i + 2 < len ? bytes[i + 2]! : 0;
    result += BASE64_CHARS[(b0 >> 2) & 0x3f];
    result += BASE64_CHARS[((b0 << 4) | (b1 >> 4)) & 0x3f];
    result += i + 1 < len ? BASE64_CHARS[((b1 << 2) | (b2 >> 6)) & 0x3f] : "=";
    result += i + 2 < len ? BASE64_CHARS[b2 & 0x3f] : "=";
  }
  return result;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const len = clean.length;
  if (len === 0) return new Uint8Array(0);
  let padding = 0;
  if (clean.endsWith("==")) padding = 2;
  else if (clean.endsWith("=")) padding = 1;
  const byteLen = Math.floor((len * 3) / 4) - padding;
  const bytes = new Uint8Array(byteLen);
  let byteIndex = 0;

  const charMap: Record<string, number> = {};
  for (let i = 0; i < BASE64_CHARS.length; i++) {
    charMap[BASE64_CHARS[i]!] = i;
  }

  for (let i = 0; i < len; i += 4) {
    const c0 = charMap[clean[i]!] ?? 0;
    const c1 = charMap[clean[i + 1]!] ?? 0;
    const c2 = charMap[clean[i + 2]!] ?? 0;
    const c3 = charMap[clean[i + 3]!] ?? 0;

    bytes[byteIndex++] = (c0 << 2) | (c1 >> 4);
    if (byteIndex < byteLen) bytes[byteIndex++] = ((c1 & 0xf) << 4) | (c2 >> 2);
    if (byteIndex < byteLen) bytes[byteIndex++] = ((c2 & 0x3) << 6) | c3;
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface StoredDeviceIdentity {
  publicKeyBase64: string;
  privateKeyHex: string;
  ecdhPrivateKeyHex: string;
  algorithm: string;
}

export interface MessagePayload {
  v: 1;
  text: string;
  replyTo?: string;
}

function makeSpki(uncompressedPoint65: Uint8Array): Uint8Array {
  const spki = new Uint8Array(P256_SPKI_HEADER.length + uncompressedPoint65.length);
  spki.set(P256_SPKI_HEADER, 0);
  spki.set(uncompressedPoint65, P256_SPKI_HEADER.length);
  return spki;
}

export function extractPeerKxSpkiBytes(publicKeyBase64: string): Uint8Array {
  try {
    const jsonStr = new TextDecoder().decode(base64ToBytes(publicKeyBase64));
    const parsed = JSON.parse(jsonStr) as { kx?: string };
    if (parsed.kx) {
      return base64ToBytes(parsed.kx);
    }
  } catch {
    // Fallback se la stringa era già direttamente SPKI in Base64
  }
  return base64ToBytes(publicKeyBase64);
}

export function extractUncompressedPointFromSpki(spkiBytes: Uint8Array): Uint8Array {
  if (spkiBytes.length === 91) {
    return spkiBytes.subarray(26);
  }
  if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
    return spkiBytes;
  }
  if (spkiBytes.length > 65) {
    return spkiBytes.subarray(spkiBytes.length - 65);
  }
  throw new Error("Formato chiave pubblica non valido.");
}

export async function hasLocalDeviceIdentity(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(K_IDENTITY);
  return stored !== null && stored.length > 0;
}

export async function getLocalDeviceIdentity(): Promise<StoredDeviceIdentity | undefined> {
  const raw = await SecureStore.getItemAsync(K_IDENTITY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as StoredDeviceIdentity;
  } catch {
    return undefined;
  }
}

export async function initializeDeviceIdentity(
  api: EstiaApi,
  token: string,
): Promise<StoredDeviceIdentity> {
  let stored = await getLocalDeviceIdentity();

  if (!stored) {
    const sigKey = p256.keygen();
    const sigPub65 = p256.getPublicKey(sigKey.secretKey, false);
    const sigSpki = makeSpki(sigPub65);

    const kxKey = p256.keygen();
    const kxPub65 = p256.getPublicKey(kxKey.secretKey, false);
    const kxSpki = makeSpki(kxPub65);

    const payload = JSON.stringify({
      kx: bytesToBase64(kxSpki),
      sig: bytesToBase64(sigSpki),
    });

    const publicKeyBase64 = bytesToBase64(new TextEncoder().encode(payload));

    stored = {
      algorithm: "ESTIA-E2E-v1",
      ecdhPrivateKeyHex: bytesToHex(kxKey.secretKey),
      privateKeyHex: bytesToHex(sigKey.secretKey),
      publicKeyBase64,
    };

    await SecureStore.setItemAsync(K_IDENTITY, JSON.stringify(stored));
  }

  await api.registerDeviceKey(token, {
    algorithm: stored.algorithm,
    publicKey: stored.publicKeyBase64,
  });

  return stored;
}

export function deriveSharedKey(
  peerSpkiBytes: Uint8Array,
  localEcdhPrivateKeyBytes: Uint8Array,
): Uint8Array {
  const peerPub65 = extractUncompressedPointFromSpki(peerSpkiBytes);
  const sharedPoint = p256.getSharedSecret(localEcdhPrivateKeyBytes, peerPub65, false);
  return sharedPoint.slice(1, 33);
}

export async function getStoredConvKey(conversazioneId: string): Promise<Uint8Array | undefined> {
  const hex = await SecureStore.getItemAsync(`${K_CONV_PREFIX}${conversazioneId}`);
  if (!hex) return undefined;
  return hexToBytes(hex);
}

export async function setStoredConvKey(
  conversazioneId: string,
  keyBytes: Uint8Array,
): Promise<void> {
  await SecureStore.setItemAsync(`${K_CONV_PREFIX}${conversazioneId}`, bytesToHex(keyBytes));
}

export async function getOrCreateConversationKey(
  api: EstiaApi,
  token: string,
  conversazioneId: string,
  peerUserId: string,
): Promise<Uint8Array> {
  const existing = await getStoredConvKey(conversazioneId);
  if (existing) {
    return existing;
  }

  return rederiveConversationKey(api, token, conversazioneId, peerUserId);
}

export async function rederiveConversationKey(
  api: EstiaApi,
  token: string,
  conversazioneId: string,
  peerUserId: string,
  specificPeerDeviceId?: string,
): Promise<Uint8Array> {
  let peerPublicKeyB64: string;

  if (specificPeerDeviceId) {
    const dev = await api.getDevicePublicKey(token, specificPeerDeviceId);
    peerPublicKeyB64 = dev.publicKey;
  } else {
    const pkg = await api.claimKeyPackage(token, peerUserId);
    peerPublicKeyB64 = pkg.publicKey;
  }

  const peerSpkiBytes = extractPeerKxSpkiBytes(peerPublicKeyB64);
  const localId = await getLocalDeviceIdentity();
  if (!localId) {
    throw new Error(
      "Il tuo dispositivo non possiede chiavi crittografiche E2E. Esegui nuovamente il login.",
    );
  }

  const localEcdhPriv = hexToBytes(localId.ecdhPrivateKeyHex);
  const keyBytes = deriveSharedKey(peerSpkiBytes, localEcdhPriv);

  await setStoredConvKey(conversazioneId, keyBytes);
  return keyBytes;
}

export function encryptMessageBody(payload: MessagePayload, keyBytes: Uint8Array): string {
  const iv = randomBytes(12);
  const cipher = gcm(keyBytes, iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = cipher.encrypt(plaintext);

  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);

  return bytesToBase64(combined);
}

export function tryDecryptMessageBody(
  bustaBase64: string,
  keyBytes: Uint8Array,
): MessagePayload | null {
  try {
    const combined = base64ToBytes(bustaBase64);
    if (combined.length < 12) return null;

    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12);

    const cipher = gcm(keyBytes, iv);
    const decrypted = cipher.decrypt(ciphertext);
    const rawText = new TextDecoder().decode(decrypted);

    if (rawText.startsWith("{")) {
      try {
        const parsed = JSON.parse(rawText) as { v?: number; text?: string; replyTo?: string };
        if (parsed.v === 1 && typeof parsed.text === "string") {
          return parsed as MessagePayload;
        }
      } catch {
        // Fallback
      }
    }

    return { text: rawText, v: 1 };
  } catch {
    return null;
  }
}

export function decryptMessageBody(bustaBase64: string, keyBytes: Uint8Array): MessagePayload {
  const res = tryDecryptMessageBody(bustaBase64, keyBytes);
  if (res) return res;
  return { text: "[Errore di decifrazione]", v: 1 };
}

export async function createAndSaveKeyBackup(
  api: EstiaApi,
  token: string,
  passphrase: string,
): Promise<void> {
  const stored = await getLocalDeviceIdentity();
  if (!stored) {
    throw new Error("Nessuna chiave dispositivo trovata localmente.");
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const aesKey = pbkdf2(sha256, passphrase, salt, { c: BACKUP_KDF_ITERATIONS, dkLen: 32 });

  const payloadText = JSON.stringify({
    createdAt: new Date().toISOString(),
    identity: stored,
  });

  const cipher = gcm(aesKey, iv);
  const encrypted = cipher.encrypt(new TextEncoder().encode(payloadText));

  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);

  await api.saveKeyBackup(token, {
    algorithm: "PBKDF2-AES-GCM-256",
    encryptedBlob: bytesToBase64(combined),
    iterations: BACKUP_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
  });
}

export async function restoreKeyBackup(
  api: EstiaApi,
  token: string,
  passphrase: string,
): Promise<StoredDeviceIdentity> {
  const backup = await api.getKeyBackup(token);
  if (!backup) {
    throw new Error("Nessun backup trovato sul server.");
  }

  const salt = base64ToBytes(backup.salt);
  const combined = base64ToBytes(backup.encryptedBlob);
  if (combined.length < 12) {
    throw new Error("Formato backup non valido.");
  }

  const iv = combined.subarray(0, 12);
  const encrypted = combined.subarray(12);

  const aesKey = pbkdf2(sha256, passphrase, salt, { c: backup.iterations, dkLen: 32 });
  let decrypted: Uint8Array;
  try {
    const cipher = gcm(aesKey, iv);
    decrypted = cipher.decrypt(encrypted);
  } catch {
    throw new Error("Passphrase non corretta o backup corrotto.");
  }

  const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
    identity: StoredDeviceIdentity;
  };

  await SecureStore.setItemAsync(K_IDENTITY, JSON.stringify(payload.identity));

  await api.registerDeviceKey(token, {
    algorithm: payload.identity.algorithm,
    publicKey: payload.identity.publicKeyBase64,
  });

  return payload.identity;
}
