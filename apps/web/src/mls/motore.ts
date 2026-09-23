/**
 * Il dispositivo MLS di questo browser, dall'accesso all'uscita.
 *
 * È il posto dove il bootstrap ([`dispositivo`](./dispositivo.ts)) incontra il
 * mondo vero: IndexedDB, l'API, la chiave della casa. Le schermate chiedono qui
 * un contesto per le chat, e qui si decide una volta sola per sessione — perché
 * preparare il dispositivo registra una chiave e pubblica una scorta, e farlo a
 * ogni conversazione aperta sarebbe rumore sull'istanza.
 *
 * Sostituisce il ciclo di vita di `ESTIA-E2E-v1` ([`../dispositivo.ts`](../dispositivo.ts))
 * al taglio di [ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)
 * punto 4. I due non convivono sulla stessa sessione: `device_keys` ha una riga
 * per sessione, e registrare una chiave sovrascrive quella che c'era.
 */
import { api } from "../api.js";
import { anagrafeSuApi, cassettoIndexedDb, depositoIndexedDb, istanzaSuApi } from "./adattatori.js";
import {
  dimentica,
  esisteIdentita,
  preparaDispositivo,
  ripristinaDaPassphrase,
  salvaSottoPassphrase,
  type Contesto as ContestoDispositivo,
} from "./dispositivo.js";
import type { Contesto } from "./sessione.js";

/** Il contesto delle chat, preparato una volta per sessione. */
let preparato: { token: string; promessa: Promise<ContestoChat> } | undefined;

export interface ContestoChat {
  ctx: Contesto;
  /** La chiave della casa di questo browser: serve a dire «questo messaggio è mio». */
  casa: string;
}

/**
 * Il contesto per le chat di questa sessione.
 *
 * La prima chiamata prepara il dispositivo; le altre riusano la stessa promessa.
 * Se la preparazione fallisce — l'istanza non risponde, per esempio — la
 * promessa si dimentica, e la prossima chiamata ci riprova invece di restare
 * ferma sull'errore di prima.
 */
export function contestoChat(token: string, username: string): Promise<ContestoChat> {
  if (preparato?.token !== token) {
    const promessa = prepara(token, username);
    preparato = { promessa, token };
    promessa.catch(() => {
      if (preparato?.promessa === promessa) {
        preparato = undefined;
      }
    });
  }

  return preparato.promessa;
}

async function contestoDispositivo(token: string): Promise<ContestoDispositivo> {
  const { casa } = await api.casa(token);
  return { anagrafe: anagrafeSuApi(token), casa, cassetto: cassettoIndexedDb };
}

async function prepara(token: string, username: string): Promise<ContestoChat> {
  const dispositivo = await contestoDispositivo(token);
  const pronto = await preparaDispositivo(dispositivo, username);

  return {
    casa: dispositivo.casa,
    ctx: {
      deposito: depositoIndexedDb,
      io: pronto.portachiavi,
      istanza: istanzaSuApi(token, dispositivo.casa),
    },
  };
}

/**
 * Che cosa serve all'accesso.
 *
 * - `pronto`: questo browser ha già la sua identità, oppure non c'è una copia
 *   da rimettere — e allora ne nasce una nuova.
 * - `da-ripristinare`: questo browser non ha niente, e sull'istanza c'è una
 *   copia delle chiavi. Si chiede la frase segreta **prima** di crearne una
 *   nuova, perché con la chiave di prima si rientra sostituendo la foglia
 *   vecchia, e con una nuova la si affianca ([S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md)).
 */
export async function statoAllAccesso(
  token: string,
  username: string,
): Promise<"pronto" | "da-ripristinare"> {
  if (await esisteIdentita(cassettoIndexedDb)) {
    await contestoChat(token, username);
    return "pronto";
  }

  if ((await api.getKeyBackup(token)) !== undefined) {
    return "da-ripristinare";
  }

  await contestoChat(token, username);
  return "pronto";
}

/** Rimette la chiave di firma dalla copia, e prepara il dispositivo con quella. */
export async function ripristina(
  token: string,
  username: string,
  passphrase: string,
): Promise<void> {
  await ripristinaDaPassphrase(await contestoDispositivo(token), passphrase);
  preparato = undefined;
  await contestoChat(token, username);
}

/** Salta il ripristino: nasce un'identità nuova su questo browser. */
export async function ricominciaDaCapo(token: string, username: string): Promise<void> {
  preparato = undefined;
  await contestoChat(token, username);
}

/** Mette la chiave di firma di questo browser sotto la frase segreta, sull'istanza. */
export async function salvaCopia(token: string, passphrase: string): Promise<void> {
  await salvaSottoPassphrase(await contestoDispositivo(token), passphrase);
}

/** Questo browser ha un'identità MLS? */
export function haIdentita(): Promise<boolean> {
  return esisteIdentita(cassettoIndexedDb);
}

/**
 * L'uscita porta via tutto: l'identità **e** lo stato dei gruppi. Chi entra
 * dopo sullo stesso browser non deve trovarsi in mano le chiavi di chi è uscito.
 */
export async function esci(): Promise<void> {
  preparato = undefined;
  await dimentica(cassettoIndexedDb, depositoIndexedDb);
}
