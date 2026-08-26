/**
 * L'archivio della conversazione, lato client ([ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)).
 *
 * Il trasporto ha la forward secrecy e distrugge le chiavi vecchie; la
 * cronologia sopravvive perché qui, dopo aver decifrato, si **ricifra il testo**
 * con una chiave d'archivio e si deposita quello.
 *
 * Lo schema è quello che lo spike [S2](../../../../docs/spike/S2-la-chiave-d-archivio.md)
 * ha verificato, e le sue due correzioni sono la ragione per cui questo modulo
 * ha la forma che ha:
 *
 * - **`mlsExporter` non è la chiave d'archivio.** Il segreto che produce è
 *   legato all'epoch, e chi entra dopo non può derivare quello di prima: un
 *   archivio cifrato così morirebbe a ogni commit. È invece la **serratura**
 *   giusta, perché tutti i membri di un'epoch la derivano identica — quindi
 *   cifra il *mazzo*, non l'archivio.
 * - **Una chiave sola non basta: è una catena.** Con una chiave immortale chi
 *   viene rimosso dal gruppo leggerebbe anche il *futuro* dell'archivio, non
 *   solo il pregresso. A ogni rimozione ne nasce una nuova, e le voci scritte
 *   dopo usano quella.
 *
 * Nessuna I/O qui dentro: si prende in mano ciò che serve e si restituisce ciò
 * che va depositato. È quello che rende l'archivio provabile senza rete.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/hashes/utils.js";

const te = new TextEncoder();
const td = new TextDecoder();

/** La catena `{A₁…Aₙ}`. L'ultima è quella con cui si scrive. */
export type Catena = readonly Uint8Array[];

export interface VoceCifrata {
  /** Quale chiave della catena l'ha cifrata. È 1-based, come in S2. */
  chiaveN: number;
  busta: string;
}

const base64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));

function daBase64(s: string): Uint8Array {
  const grezzo = atob(s);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) {
    bytes[i] = grezzo.charCodeAt(i);
  }
  return bytes;
}

function sigilla(chiave: Uint8Array, dati: Uint8Array): Uint8Array {
  const iv = randomBytes(12);
  const cifrato = gcm(chiave, iv).encrypt(dati);
  const insieme = new Uint8Array(iv.length + cifrato.length);
  insieme.set(iv, 0);
  insieme.set(cifrato, iv.length);
  return insieme;
}

function apri(chiave: Uint8Array, insieme: Uint8Array): Uint8Array {
  if (insieme.length < 12) {
    throw new Error("Busta d'archivio troppo corta per contenere qualcosa.");
  }
  return gcm(chiave, insieme.subarray(0, 12)).decrypt(insieme.subarray(12));
}

/**
 * La prima chiave, che nasce con la conversazione.
 *
 * **Casuale, non derivata da MLS**: è precisamente ciò che la rende immune ai
 * cambi di epoch, e quindi ciò che rende la cronologia recuperabile.
 */
export function catenaNuova(): Catena {
  return [randomBytes(32)];
}

/**
 * Aggiunge una chiave. Si fa **a ogni rimozione dal gruppo**: chi esce conserva
 * quelle che aveva — e lì la crittografia non può niente, quelle chiavi le ha
 * avute — ma non ottiene questa, quindi non legge il seguito.
 */
export function catenaRuotata(catena: Catena): Catena {
  return [...catena, randomBytes(32)];
}

/** Avvolge il mazzo sotto la serratura dell'epoch corrente. */
export function avvolgi(catena: Catena, serratura: Uint8Array): string {
  const payload = te.encode(JSON.stringify(catena.map(base64)));
  return base64(sigilla(serratura, payload));
}

/** Apre il mazzo. Ci riesce chi è nel gruppo a quell'epoch, e nessun altro. */
export function svolgi(mazzoAvvolto: string, serratura: Uint8Array): Catena {
  const testo = td.decode(apri(serratura, daBase64(mazzoAvvolto)));
  const pezzi = JSON.parse(testo) as unknown;

  if (!Array.isArray(pezzi) || pezzi.some((p) => typeof p !== "string")) {
    throw new Error("Questo non è un mazzo di chiavi d'archivio.");
  }

  return (pezzi as string[]).map(daBase64);
}

/** Ricifra un testo con l'ultima chiave della catena. */
export function archivia(catena: Catena, testo: string): VoceCifrata {
  const ultima = catena.at(-1);
  if (ultima === undefined) {
    throw new Error("Una catena vuota non archivia niente.");
  }

  return { busta: base64(sigilla(ultima, te.encode(testo))), chiaveN: catena.length };
}

/**
 * Rilegge una voce. **Torna `undefined` invece di inventare un testo**: una voce
 * che non si apre è uno stato da mostrare, non una frase da scrivere nella
 * nuvoletta — è il rilievo che la revisione aveva mosso al client mobile.
 */
export function rileggi(catena: Catena, voce: VoceCifrata): string | undefined {
  const chiave = catena[voce.chiaveN - 1];
  if (chiave === undefined) {
    return undefined;
  }

  try {
    return td.decode(apri(chiave, daBase64(voce.busta)));
  } catch {
    return undefined;
  }
}
