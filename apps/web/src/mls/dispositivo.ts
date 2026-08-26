/**
 * Il bootstrap MLS del dispositivo ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) punto 4).
 *
 * È il pezzo che mancava a monte di tutto: finché un dispositivo pubblica
 * `KeyPackage` di `ESTIA-E2E-v1`, nessuna conversazione può nascere su MLS,
 * perché non c'è un `KeyPackage` da cui partire.
 *
 * Qui dentro ci sono tre cose e nient'altro:
 *
 * 1. **Una chiave di firma a vita lunga.** È l'identità del dispositivo, ed è
 *    quella che l'istanza registra in `device_keys` — cioè il registro su cui
 *    poggia l'`AuthenticationService` ([S4](../../../../docs/spike/S4-autenticare-chi-entra.md)).
 *    È anche l'unica cosa che il backup con passphrase custodisce.
 * 2. **Una scorta di `KeyPackage`.** Un `KeyPackage` è monouso e l'istanza lo
 *    consuma quando qualcuno lo preleva per aprire una conversazione: se ce ne
 *    fosse uno solo, la seconda persona che ti scrive non troverebbe niente.
 * 3. **Il backup sotto passphrase**, che dopo [ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)
 *    non custodisce più chiavi di messaggio: quelle non esistono più.
 *
 * **Nel backup c'è la chiave di firma e basta, e non è una semplificazione.**
 * Se ci fossero anche le metà private della scorta, un dispositivo nuovo con la
 * sola passphrase riaprirebbe il Welcome vecchio e con esso il trasporto di
 * quell'epoch — cioè esattamente ciò che la verifica 5 di ADR 0038 vieta. Il
 * rientro giusto è quello della via A di [S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md):
 * stessa chiave di firma, foglia nuova, `resync`.
 *
 * Come i suoi vicini, non conosce né IndexedDB né `fetch`: chiede un `Cassetto`
 * e un'`Anagrafe`. È ciò che rende il bootstrap provabile senza browser.
 */
import {
  identitaDaChiave,
  leggiKeyPackage,
  nuovaIdentita,
  sceltaPerWelcome,
  scriviKeyPackage,
  type IdentitaDispositivo,
  type Portachiavi,
} from "./gruppo.js";
import type { PrivateKeyPackage } from "ts-mls";

/**
 * Come si chiama questa crittografia in `device_keys`.
 *
 * Serve a distinguerla da `ESTIA-E2E-v1`, che nel registro deposita un JSON
 * `{sig, kx}` in Base64 e non una chiave di firma MLS: chi legge il registro per
 * autenticare deve poter scartare le righe che non parlano questa lingua.
 */
export const ALGORITMO = "MLS-P256-v1";

/**
 * Quanti `KeyPackage` tenere pubblicati.
 *
 * Ognuno vale una conversazione nuova iniziata da qualcun altro, e si ricarica
 * al giro dopo. Dieci sono larghi per una casa e pesano qualche kilobyte.
 */
const SCORTA = 10;

/**
 * Quante metà private conservare in tutto, contando quelle delle sessioni
 * passate. Una vecchia serve solo a un Welcome che non è mai stato consegnato,
 * e quelli non si accumulano all'infinito: oltre questo tetto si buttano le più
 * vecchie, invece di far crescere il deposito a ogni accesso.
 */
const TETTO = SCORTA * 4;

/** Le stesse di `ESTIA-E2E-v1`: la passphrase non cambia di forza. */
const ITERAZIONI = 600000;

/** Un cassetto dove il dispositivo tiene le sue cose. In produzione è IndexedDB. */
export interface Cassetto {
  leggi: (chiave: string) => Promise<unknown>;
  scrivi: (chiave: string, valore: unknown) => Promise<void>;
  svuota: () => Promise<void>;
}

/** Ciò che il bootstrap chiede all'istanza. Niente di più. */
export interface Anagrafe {
  /** Registra la chiave di firma per la sessione corrente, e dice quale dispositivo è. */
  registra: (chiave: {
    publicKey: string;
    algorithm: string;
    keyPackages?: string[];
  }) => Promise<{ deviceId: string }>;
  pubblica: (keyPackages: string[]) => Promise<void>;
  leggiBackup: () => Promise<
    { encryptedBlob: string; salt: string; iterations: number } | undefined
  >;
  salvaBackup: (backup: {
    encryptedBlob: string;
    algorithm: string;
    salt: string;
    iterations: number;
  }) => Promise<void>;
}

export interface Contesto {
  cassetto: Cassetto;
  anagrafe: Anagrafe;
}

/** Un `KeyPackage` pubblicato, con la metà privata che sta qui e non esce. */
interface InScorta {
  /** Il pubblico, nella forma in cui viaggia. */
  pubblico: Uint8Array;
  privato: PrivateKeyPackage;
  /** La riga di `device_keys` sotto cui è stato pubblicato. */
  pubblicatoPer: string;
}

interface Materiale {
  v: 1;
  username: string;
  chiaviDiFirma: { publicKey: Uint8Array; signKey: Uint8Array };
  scorta: InScorta[];
}

const CHIAVE = "materiale_mls";

const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));

function daB64(s: string): Uint8Array<ArrayBuffer> {
  const grezzo = atob(s);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) {
    bytes[i] = grezzo.charCodeAt(i);
  }
  return bytes;
}

const uguali = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

async function leggiMateriale(cassetto: Cassetto): Promise<Materiale | undefined> {
  const letto = (await cassetto.leggi(CHIAVE)) as Materiale | undefined;
  return letto?.v === 1 ? letto : undefined;
}

/** C'è già un'identità MLS su questo dispositivo? */
export async function esisteIdentita(cassetto: Cassetto): Promise<boolean> {
  return (await leggiMateriale(cassetto)) !== undefined;
}

async function nuovoMateriale(username: string): Promise<Materiale> {
  // La prima identità serve solo a farsi dare una chiave di firma: il suo
  // `KeyPackage` si butta, perché quella chiave di firma dura e i KeyPackage no.
  const prima = await nuovaIdentita(username);
  return {
    chiaviDiFirma: {
      publicKey: prima.publicPackage.leafNode.signaturePublicKey,
      signKey: prima.privatePackage.signaturePrivateKey,
    },
    scorta: [],
    username,
    v: 1,
  };
}

export interface Dispositivo {
  username: string;
  /** La riga di `device_keys` di questa sessione. */
  deviceId: string;
  portachiavi: Portachiavi;
}

/**
 * Prepara il dispositivo: identità, registrazione, scorta.
 *
 * Si chiama a ogni accesso, ed è idempotente. La scorta si ricarica **per riga
 * di `device_keys`**: un accesso nuovo è una riga nuova, e una riga nuova nasce
 * senza `KeyPackage` — quindi chi entra da una seconda sessione dello stesso
 * browser ne pubblica una sua, con la stessa chiave di firma.
 *
 * Il conto della scorta è quello che questo dispositivo **crede** di avere
 * pubblicato: cala quando un Welcome consuma una chiave. Se qualcuno preleva un
 * `KeyPackage` e poi non manda mai il Welcome, il conto resta alto di uno e
 * l'istanza ne ha uno in meno. È una finestra stretta — chi apre una
 * conversazione deposita il Welcome subito dopo aver prelevato — e il prezzo è
 * che quella volta la scorta si ricarica un giro più tardi.
 */
export async function preparaDispositivo(ctx: Contesto, username: string): Promise<Dispositivo> {
  const materiale = (await leggiMateriale(ctx.cassetto)) ?? (await nuovoMateriale(username));

  const { deviceId } = await ctx.anagrafe.registra({
    algorithm: ALGORITMO,
    publicKey: b64(materiale.chiaviDiFirma.publicKey),
  });

  const mancanti = SCORTA - materiale.scorta.filter((p) => p.pubblicatoPer === deviceId).length;
  if (mancanti > 0) {
    const nuovi: InScorta[] = [];
    for (let i = 0; i < mancanti; i++) {
      const pacchetto = await identitaDaChiave(materiale.username, materiale.chiaviDiFirma);
      nuovi.push({
        privato: pacchetto.privatePackage,
        pubblicatoPer: deviceId,
        pubblico: scriviKeyPackage(pacchetto.publicPackage),
      });
    }

    await ctx.anagrafe.pubblica(nuovi.map((p) => b64(p.pubblico)));
    materiale.scorta = [...materiale.scorta, ...nuovi].slice(-TETTO);
  }

  await ctx.cassetto.scrivi(CHIAVE, materiale);

  return {
    deviceId,
    portachiavi: portachiaviSu(ctx.cassetto),
    username: materiale.username,
  };
}

/**
 * Le chiavi di questo dispositivo, come la sessione MLS se le aspetta.
 *
 * Rilegge il cassetto a ogni richiesta invece di tenersi una copia: due schede
 * aperte sono due copie, e una che consuma una chiave mentre l'altra la crede
 * ancora buona è il modo per aprire lo stesso Welcome due volte.
 */
export function portachiaviSu(cassetto: Cassetto): Portachiavi {
  return {
    async perNuovaFoglia() {
      const materiale = await leggiMateriale(cassetto);
      if (materiale === undefined) {
        throw new Error("Questo dispositivo non ha ancora un'identità MLS.");
      }
      return identitaDaChiave(materiale.username, materiale.chiaviDiFirma);
    },

    async perWelcome(welcome) {
      const materiale = await leggiMateriale(cassetto);
      if (materiale === undefined) {
        return undefined;
      }

      const candidati: IdentitaDispositivo[] = [];
      for (const voce of materiale.scorta) {
        const pubblico = leggiKeyPackage(voce.pubblico);
        if (pubblico !== undefined) {
          candidati.push({ privatePackage: voce.privato, publicPackage: pubblico });
        }
      }

      const scelta = await sceltaPerWelcome(welcome, candidati);
      if (scelta === undefined) {
        return undefined;
      }

      // Consumata: una chiave d'ingresso usata due volte varrebbe due gruppi
      // protetti dallo stesso segreto.
      const usata = scriviKeyPackage(scelta.publicPackage);
      materiale.scorta = materiale.scorta.filter((voce) => !uguali(voce.pubblico, usata));
      await cassetto.scrivi(CHIAVE, materiale);

      return scelta;
    },
  };
}

/**
 * Il logout porta via tutto: l'identità **e** lo stato dei gruppi.
 *
 * Non è una pulizia di cortesia. La revisione del 2026-08-26 ha trovato sul
 * client mobile che le chiavi E2E sopravvivevano al logout e passavano
 * all'account successivo: chi entrava dopo di te sullo stesso dispositivo si
 * trovava in mano le tue.
 */
export async function dimentica(
  cassetto: Cassetto,
  statiDeiGruppi: { svuota: () => Promise<void> },
): Promise<void> {
  await cassetto.svuota();
  await statiDeiGruppi.svuota();
}

/* ------------------------- il backup con passphrase ------------------------- */

interface Custodito {
  v: 1;
  algoritmo: string;
  username: string;
  publicKey: string;
  signKey: string;
}

function subtle(): SubtleCrypto {
  const disponibile = globalThis.crypto?.subtle;
  if (disponibile === undefined) {
    throw new Error(
      "WebCrypto non è disponibile. Serve una connessione sicura (HTTPS o localhost).",
    );
  }
  return disponibile;
}

async function chiaveDaPassphrase(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  uso: "encrypt" | "decrypt",
): Promise<CryptoKey> {
  const base = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return subtle().deriveKey(
    { hash: "SHA-256", iterations, name: "PBKDF2", salt },
    base,
    { length: 256, name: "AES-GCM" },
    false,
    [uso],
  );
}

/**
 * Mette la chiave di firma sotto passphrase e la deposita sull'istanza.
 *
 * L'istanza non conosce la passphrase e non apre il blob ([ADR 0028](../../../../docs/adr/0028-il-dispositivo-portatore-di-chiavi.md)).
 * Dentro c'è **solo** l'identità: la scorta no, e la ragione sta in cima a
 * questo file.
 */
export async function salvaSottoPassphrase(ctx: Contesto, passphrase: string): Promise<void> {
  const materiale = await leggiMateriale(ctx.cassetto);
  if (materiale === undefined) {
    throw new Error("Questo dispositivo non ha ancora un'identità MLS da custodire.");
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const custodito: Custodito = {
    algoritmo: ALGORITMO,
    publicKey: b64(materiale.chiaviDiFirma.publicKey),
    signKey: b64(materiale.chiaviDiFirma.signKey),
    username: materiale.username,
    v: 1,
  };

  const cifrato = new Uint8Array(
    await subtle().encrypt(
      { iv, name: "AES-GCM" },
      await chiaveDaPassphrase(passphrase, salt, ITERAZIONI, "encrypt"),
      new TextEncoder().encode(JSON.stringify(custodito)),
    ),
  );

  const insieme = new Uint8Array(iv.length + cifrato.length);
  insieme.set(iv, 0);
  insieme.set(cifrato, iv.length);

  await ctx.anagrafe.salvaBackup({
    algorithm: "PBKDF2-AES-GCM-256",
    encryptedBlob: b64(insieme),
    iterations: ITERAZIONI,
    salt: b64(salt),
  });
}

/**
 * Riporta la chiave di firma su questo dispositivo.
 *
 * Non ricostruisce la scorta: quella si ripubblica con
 * [`preparaDispositivo`](#preparaDispositivo), che va chiamato subito dopo.
 * E non riapre da sola nessuna conversazione — per quello serve il rientro, che
 * è un'altra cosa e passa dal punto pubblicato dall'istanza.
 */
export async function ripristinaDaPassphrase(ctx: Contesto, passphrase: string): Promise<void> {
  const backup = await ctx.anagrafe.leggiBackup();
  if (backup === undefined) {
    throw new Error("Non c'è nessun backup delle chiavi su questa istanza.");
  }

  const insieme = daB64(backup.encryptedBlob);
  if (insieme.length <= 12) {
    throw new Error("Il backup delle chiavi non ha una forma valida.");
  }

  let chiaro: ArrayBuffer;
  try {
    chiaro = await subtle().decrypt(
      { iv: insieme.slice(0, 12), name: "AES-GCM" },
      await chiaveDaPassphrase(passphrase, daB64(backup.salt), backup.iterations, "decrypt"),
      insieme.slice(12),
    );
  } catch {
    throw new Error("Passphrase non corretta, o backup danneggiato.");
  }

  const custodito = JSON.parse(new TextDecoder().decode(chiaro)) as Partial<Custodito> & {
    identity?: unknown;
  };

  // Un backup di prima del passaggio a MLS custodiva chiavi ECDH/ECDSA che qui
  // non servono a niente. Dirlo è meglio che fallire più tardi e altrove.
  if (custodito.identity !== undefined) {
    throw new Error(
      "Questo backup è di prima del passaggio a MLS: non contiene una chiave che questo dispositivo possa usare.",
    );
  }

  if (
    custodito.v !== 1 ||
    custodito.publicKey === undefined ||
    custodito.signKey === undefined ||
    custodito.username === undefined
  ) {
    throw new Error("Il backup delle chiavi non ha una forma che questo dispositivo conosca.");
  }

  await ctx.cassetto.scrivi(CHIAVE, {
    chiaviDiFirma: {
      publicKey: daB64(custodito.publicKey),
      signKey: daB64(custodito.signKey),
    },
    // La scorta non si ripristina: si ripubblica.
    scorta: [],
    username: custodito.username,
    v: 1,
  } satisfies Materiale);
}
