/**
 * I due adattatori che collegano [`sessione`](./sessione.ts) al mondo vero.
 *
 * La sessione non conosce né IndexedDB né `fetch`: chiede un `Deposito` e
 * un'`Istanza`, e li riceve. Qui ci sono le implementazioni che si usano nel
 * browser — sottili di proposito, perché tutto ciò che è sottile qui è ciò che
 * i test della sessione possono coprire là.
 *
 * Nessuna logica di protocollo in questo file. Se ce ne finisce, è nel posto
 * sbagliato.
 */
import type { HandshakeTipo } from "@estia/contracts";

import { api } from "../api.js";
import type { Deposito, Istanza, VoceArchivio } from "./sessione.js";

/* ------------------------------ il deposito ------------------------------ */

const DB = "estia_mls_v1";
const STATI = "stati_gruppo";
const CURSORI = "cursori_handshake";

function apriDb(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    if (typeof indexedDB === "undefined") {
      rifiuta(new Error("IndexedDB non disponibile."));
      return;
    }

    const richiesta = indexedDB.open(DB, 1);
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result;
      if (!db.objectStoreNames.contains(STATI)) {
        db.createObjectStore(STATI);
      }
      if (!db.objectStoreNames.contains(CURSORI)) {
        db.createObjectStore(CURSORI);
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
      return registro.chiavi.map((c) => daB64(c.publicKey));
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
  };
}

export { b64 as bytesInBase64, daB64 as base64InBytes };
