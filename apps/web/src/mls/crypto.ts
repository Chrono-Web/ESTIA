const DB_NAME = "estia_crypto_v1";
const STORE_NAME = "conv_keys";

function openConvDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB non disponibile."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
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

/**
 * Ottiene o genera la chiave AES-GCM-256 per la conversazione specificata.
 */
export async function getOrCreateConversationKey(conversazioneId: string): Promise<CryptoKey> {
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

  // Genera nuova chiave di conversazione
  const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);

  const exported = await window.crypto.subtle.exportKey("jwk", key);
  await setStoredConvKey(conversazioneId, exported);

  return key;
}

/**
 * Cifra un messaggio di testo producendo una busta Base64 [IV 12B + Ciphertext + Tag 16B].
 */
export async function encryptMessageBody(text: string, key: CryptoKey): Promise<string> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintextBytes = enc.encode(text);

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
 * Decifra una busta Base64 per estrarre il testo in chiaro.
 */
export async function decryptMessageBody(bustaBase64: string, key: CryptoKey): Promise<string> {
  try {
    const combinedBuf = base64ToBuffer(bustaBase64);
    const combinedBytes = new Uint8Array(combinedBuf);

    if (combinedBytes.byteLength < 12) {
      return "[Busta non valida o corrotta]";
    }

    const iv = combinedBytes.slice(0, 12);
    const ciphertext = combinedBytes.slice(12);

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuf);
  } catch {
    return "[Messaggio cifrato - chiave non disponibile o non corrispondente]";
  }
}
