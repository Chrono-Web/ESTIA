/**
 * Gli adattatori che collegano il modulo MLS al mondo vero.
 *
 * Né la sessione né il bootstrap conoscono IndexedDB o `fetch`: chiedono un
 * `Deposito`, un `Cassetto`, un'`Istanza`, un'`Anagrafe`, e li ricevono. Qui ci
 * sono le implementazioni che si usano nel browser — sottili di proposito, perché tutto ciò che è sottile qui è ciò che
 * i test della sessione possono coprire là.
 *
 * Nessuna logica di protocollo in questo file. Se ce ne finisce, è nel posto
 * sbagliato.
 */
import type { HandshakeTipo } from "@estia/contracts";

import { api } from "../api.js";
import { ALGORITMO, type Anagrafe, type Cassetto } from "./dispositivo.js";
import type { Deposito, Istanza, VoceArchivio } from "./sessione.js";

/* ------------------------------ il deposito ------------------------------ */

const DB = "estia_mls_v1";
const STATI = "stati_gruppo";
const CURSORI = "cursori_handshake";
/** L'identità del dispositivo e la sua scorta di `KeyPackage`. */
const DISPOSITIVO = "dispositivo";

function apriDb(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    if (typeof indexedDB === "undefined") {
      rifiuta(new Error("IndexedDB non disponibile."));
      return;
    }

    const richiesta = indexedDB.open(DB, 2);
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result;
      if (!db.objectStoreNames.contains(STATI)) {
        db.createObjectStore(STATI);
      }
      if (!db.objectStoreNames.contains(CURSORI)) {
        db.createObjectStore(CURSORI);
      }
      if (!db.objectStoreNames.contains(DISPOSITIVO)) {
        db.createObjectStore(DISPOSITIVO);
      }
    };
    richiesta.onsuccess = () => resolveDb(richiesta, risolvi);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}

function resolveDb(richiesta: IDBRequest<IDBDatabase>, risolvi: (db: IDBDatabase) => void): void {
  risolvi(richiesta.result);
}

function leggiDa<T>(store: string, chiave: string): Promise<T | undefined> {
  return apriDb().then(
    (db) =>
      new Promise<T | undefined>((risolvi, rifiuta) => {
        const richiesta = db.transaction(store, "readonly").objectStore(store).get(chiave);
        richiesta.onsuccess = () => {
          risolvi(richiesta.result as T | undefined);
        };
        richiesta.onerror = () => {
          rifiuta(richiesta.error);
        };
      }),
  );
}

function svuotaStore(store: string): Promise<void> {
  return apriDb().then(
    (db) =>
      new Promise<void>((risolvi, rifiuta) => {
        const richiesta = db.transaction(store, "readwrite").objectStore(store).clear();
        richiesta.onsuccess = () => {
          risolvi();
        };
        richiesta.onerror = () => {
          rifiuta(richiesta.error);
        };
      }),
  );
}

function scriviIn(store: string, chiave: string, valore: unknown): Promise<void> {
  return apriDb().then(
    (db) =>
      new Promise<void>((risolvi, rifiuta) => {
        const richiesta = db.transaction(store, "readwrite").objectStore(store).put(valore, chiave);
        richiesta.onsuccess = () => {
          risolvi();
        };
        richiesta.onerror = () => {
          rifiuta(richiesta.error);
        };
      }),
  );
}

/**
 * Lo stato del gruppo vive nel browser e **non esce mai da lì**.
 *
 * È la differenza fra il trasporto e l'archivio: l'archivio si deposita
 * sull'istanza perché deve sopravvivere al dispositivo, lo stato del ratchet no
 * — depositarlo vorrebbe dire rinunciare alla forward secrecy in un altro posto
 * ([ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)).
 */
export const depositoIndexedDb: Deposito = {
  leggi: (conversazioneId) => leggiDa<Uint8Array>(STATI, conversazioneId),
  leggiCursore: (conversazioneId) => leggiDa<string>(CURSORI, conversazioneId),
  scrivi: (conversazioneId, stato) => scriviIn(STATI, conversazioneId, stato),
  scriviCursore: (conversazioneId, cursore) => scriviIn(CURSORI, conversazioneId, cursore),
  svuota: async () => {
    await svuotaStore(STATI);
    await svuotaStore(CURSORI);
  },
};

/**
 * Il cassetto del dispositivo: la chiave di firma e la scorta.
 *
 * Sta accanto agli stati dei gruppi e non dentro: sono due vite diverse, e il
 * logout le porta via entrambe ([`dimentica`](./dispositivo.ts)).
 */
export const cassettoIndexedDb: Cassetto = {
  leggi: (chiave) => leggiDa<unknown>(DISPOSITIVO, chiave),
  scrivi: (chiave, valore) => scriviIn(DISPOSITIVO, chiave, valore),
  svuota: () => svuotaStore(DISPOSITIVO),
};

/* ------------------------------- l'istanza ------------------------------- */

const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));

function daB64(s: string): Uint8Array {
  const grezzo = atob(s);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) {
    bytes[i] = grezzo.charCodeAt(i);
  }
  return bytes;
}

/** Un 404 qui non è un guasto: vuol dire «non c'è ancora». */
async function seEsiste<T>(chiamata: Promise<T>): Promise<T | undefined> {
  try {
    return await chiamata;
  } catch (causa) {
    if (causa instanceof Error && "status" in causa && causa.status === 404) {
      return undefined;
    }
    throw causa;
  }
}

/**
 * L'istanza vera, sulle rotte di [ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md).
 *
 * `chiaviDiFirmaDi` è la più importante delle sei: è il registro su cui poggia
 * l'`AuthenticationService`, senza il quale — lo ha misurato
 * [S4](../../../../docs/spike/S4-autenticare-chi-entra.md) — chiunque ottenga un
 * `GroupInfo` entra come chi vuole. Ferma l'estraneo; **non** ferma chi ospita,
 * perché il registro è dell'istanza, e quel limite si chiude fuori banda.
 */
export function istanzaSuApi(token: string): Istanza {
  return {
    archivio: async (conversazioneId, dopo) => {
      const pagina = await api.getArchivio(token, conversazioneId, dopo);
      return {
        voci: pagina.voci as VoceArchivio[],
        ...(pagina.prossimo === undefined ? {} : { prossimo: pagina.prossimo }),
      };
    },

    async chiaviDiFirmaDi(username) {
      const registro = await api.chiaviDiFirmaDi(token, username);
      // Solo le chiavi MLS. Una riga di `ESTIA-E2E-v1` custodisce un JSON
      // `{sig, kx}` in Base64, non una chiave di firma: darla in pasto al
      // confronto sarebbe rumore, e un giorno potrebbe non esserlo.
      return registro.chiavi
        .filter((c) => c.algorithm === ALGORITMO)
        .map((c) => daB64(c.publicKey));
    },

    depositaArchivio: async (conversazioneId, voci) => {
      await api.depositaArchivio(token, conversazioneId, { voci });
    },

    depositaHandshake: async (conversazioneId, busta) => {
      await api.depositaHandshake(token, conversazioneId, {
        busta: busta.busta,
        epoch: busta.epoch,
        tipo: busta.tipo as HandshakeTipo,
        ...(busta.destinatario === undefined ? {} : { destinatario: busta.destinatario }),
      });
    },

    handshakeDopo: async (conversazioneId, dopo) => {
      const pagina = await api.handshake(token, conversazioneId, dopo);
      return {
        handshake: pagina.handshake,
        ...(pagina.prossimo === undefined ? {} : { prossimo: pagina.prossimo }),
      };
    },

    mazzo: async (conversazioneId) => {
      const letto = await seEsiste(api.getMazzoArchivio(token, conversazioneId));
      return letto === undefined ? undefined : { epoch: letto.epoch, mazzo: letto.mazzo };
    },

    salvaMazzo: async (conversazioneId, dati) => {
      await api.saveMazzoArchivio(token, conversazioneId, dati);
    },

    salvaPuntoDiRientro: async (conversazioneId, dati) => {
      await api.saveGroupInfo(token, conversazioneId, dati);
    },
  };
}

/** L'anagrafe vera: `device_keys`, i `KeyPackage` e il backup con passphrase. */
export function anagrafeSuApi(token: string): Anagrafe {
  return {
    leggiBackup: async () => {
      const backup = await api.getKeyBackup(token);
      return backup === undefined
        ? undefined
        : {
            encryptedBlob: backup.encryptedBlob,
            iterations: backup.iterations,
            salt: backup.salt,
          };
    },

    pubblica: async (keyPackages) => {
      await api.publishKeyPackages(token, { keyPackages });
    },

    registra: async (chiave) => {
      const registrato = await api.registerDeviceKey(token, chiave);
      return { deviceId: registrato.device.id };
    },

    salvaBackup: async (backup) => {
      await api.saveKeyBackup(token, backup);
    },
  };
}

export { b64 as bytesInBase64, daB64 as base64InBytes };
