/**
 * La sessione MLS di una conversazione ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md) punto 4).
 *
 * È il pezzo che tiene insieme i tre di sotto: [`gruppo`](./gruppo.ts) fa la
 * crittografia, [`archivio`](./archivio.ts) fa la cronologia, e qui si decide
 * **quando** e **in che ordine** — che è dove le cose si rompono davvero.
 *
 * Due dipendenze, entrambe iniettate: un `Deposito` dove mettere lo stato del
 * gruppo, e un'`Istanza` a cui chiedere ciò che sta sul server. Nessuna delle
 * due è IndexedDB o `fetch`: è quello che rende la sessione provabile senza
 * browser e senza rete, e i test qui accanto la provano così.
 *
 * Tre regole, e nessuna è un dettaglio:
 *
 * 1. **Gli handshake si applicano in ordine di arrivo, uno alla volta.** MLS li
 *    applica in sequenza; saltarne uno o invertirli spacca lo stato del gruppo.
 *    Il cursore avanza solo su ciò che è stato applicato davvero.
 * 2. **Lo stato si salva dopo ogni mutazione.** Una scheda chiusa a metà di un
 *    commit non deve lasciare un gruppo a un'epoch che nessun altro conosce.
 * 3. **Il mazzo d'archivio si riavvolge a ogni cambio di epoch**, perché la
 *    serratura è quella dell'epoch ([S2](../../../../docs/spike/S2-la-chiave-d-archivio.md)).
 */
import { decodeGroupState, encodeGroupState, type GroupState } from "ts-mls/clientState.js";

import {
  archivia,
  avvolgi,
  catenaNuova,
  catenaRuotata,
  rileggi,
  svolgi,
  type Catena,
  type VoceCifrata,
} from "./archivio.js";
import {
  aggiungi,
  applicaHandshake,
  cifra,
  configurazione,
  creaConversazione,
  decifra,
  entraDaWelcome,
  epochDi,
  puntoDiRientro,
  serraturaArchivio,
  type Porta,
  type Portachiavi,
} from "./gruppo.js";
import type { ClientState, KeyPackage } from "ts-mls";

/** Dove si conserva lo stato del gruppo. In produzione è IndexedDB. */
export interface Deposito {
  leggi: (conversazioneId: string) => Promise<Uint8Array | undefined>;
  scrivi: (conversazioneId: string, stato: Uint8Array) => Promise<void>;
  /** Il cursore degli handshake già applicati. */
  leggiCursore: (conversazioneId: string) => Promise<string | undefined>;
  scriviCursore: (conversazioneId: string, cursore: string) => Promise<void>;
  /**
   * Via tutto, al logout.
   *
   * Lo stato di un gruppo è materiale di chi era entrato: lasciarlo lì
   * significa consegnarlo a chi accede dopo sullo stesso browser.
   */
  svuota: () => Promise<void>;
}

export interface VoceArchivio {
  id: string;
  chiaveN: number;
  busta: string;
  createdAt: string;
}

export interface BustaHandshake {
  id: string;
  tipo: "commit" | "welcome";
  epoch: number;
  busta: string;
}

/** Ciò che la sessione chiede all'istanza. Niente di più. */
export interface Istanza extends Porta {
  handshakeDopo: (
    conversazioneId: string,
    dopo?: string,
  ) => Promise<{ handshake: BustaHandshake[]; prossimo?: string }>;
  depositaHandshake: (
    conversazioneId: string,
    busta: { tipo: "commit" | "welcome"; epoch: number; busta: string; destinatario?: string },
  ) => Promise<void>;
  mazzo: (conversazioneId: string) => Promise<{ mazzo: string; epoch: number } | undefined>;
  salvaMazzo: (conversazioneId: string, dati: { mazzo: string; epoch: number }) => Promise<void>;
  /** Il punto da cui si rientra. L'istanza non lo apre: per lei è un blob e un'epoch. */
  salvaPuntoDiRientro: (
    conversazioneId: string,
    dati: { groupInfo: string; epoch: number },
  ) => Promise<void>;
  archivio: (
    conversazioneId: string,
    dopo?: string,
  ) => Promise<{ voci: VoceArchivio[]; prossimo?: string }>;
  depositaArchivio: (conversazioneId: string, voci: VoceArchivio[]) => Promise<void>;
}

export interface Sessione {
  conversazioneId: string;
  stato: ClientState;
  catena: Catena;
}

const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));

function daB64(s: string): Uint8Array {
  const grezzo = atob(s);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) {
    bytes[i] = grezzo.charCodeAt(i);
  }
  return bytes;
}

export interface Contesto {
  deposito: Deposito;
  istanza: Istanza;
  /** Le chiavi di questo dispositivo. Sono più d'una: un `KeyPackage` è monouso. */
  io: Portachiavi;
}

async function salva(ctx: Contesto, sessione: Sessione): Promise<void> {
  await ctx.deposito.scrivi(sessione.conversazioneId, encodeGroupState(sessione.stato));
}

async function ripristina(
  ctx: Contesto,
  conversazioneId: string,
): Promise<ClientState | undefined> {
  const byte = await ctx.deposito.leggi(conversazioneId);
  if (byte === undefined) {
    return undefined;
  }

  const letto = decodeGroupState(byte, 0);
  if (letto === undefined) {
    // Uno stato illeggibile non si aggiusta indovinando: si riparte.
    return undefined;
  }

  return { ...(letto[0] as GroupState), clientConfig: configurazione(ctx.istanza) };
}

/**
 * Applica gli handshake che mancano, **in ordine e uno alla volta**.
 *
 * Il cursore avanza solo su ciò che è stato applicato davvero: se un commit non
 * si applica ci si ferma lì, perché saltarlo lascerebbe lo stato a un'epoch che
 * il resto del gruppo ha già superato — e da lì non si torna indietro.
 */
export async function sincronizza(ctx: Contesto, sessione: Sessione): Promise<Sessione> {
  let stato = sessione.stato;
  let cursore = await ctx.deposito.leggiCursore(sessione.conversazioneId);
  let mutato = false;

  for (;;) {
    const pagina = await ctx.istanza.handshakeDopo(sessione.conversazioneId, cursore);
    if (pagina.handshake.length === 0) {
      break;
    }

    let ultimoApplicato: string | undefined;

    for (const voce of pagina.handshake) {
      // Un Welcome non si «applica»: o si è già dentro, o si entra — e in quel
      // caso non si passa di qui.
      // Un commit di un'epoch già superata è nostro, o è vecchio: in entrambi i
      // casi non si riapplica.
      if (voce.tipo !== "welcome" && voce.epoch > epochDi(stato)) {
        stato = await applicaHandshake(stato, daB64(voce.busta), ctx.istanza);
        mutato = true;
      }

      ultimoApplicato = voce.id;
    }

    if (ultimoApplicato !== undefined) {
      cursore = ultimoApplicato;
      await ctx.deposito.scriviCursore(sessione.conversazioneId, ultimoApplicato);
    }

    if (pagina.prossimo === undefined) {
      break;
    }
    cursore = pagina.prossimo;
  }

  const aggiornata = { ...sessione, stato };
  if (mutato) {
    await salva(ctx, aggiornata);
    await dopoIlCambioDiEpoch(ctx, aggiornata);
  }

  return aggiornata;
}

/** Riavvolge il mazzo sotto la serratura dell'epoch corrente (regola 3). */
async function riavvolgiMazzo(ctx: Contesto, sessione: Sessione): Promise<void> {
  await ctx.istanza.salvaMazzo(sessione.conversazioneId, {
    epoch: epochDi(sessione.stato),
    mazzo: avvolgi(sessione.catena, await serraturaArchivio(sessione.stato)),
  });
}

/**
 * Quello che si fa quando l'epoch cambia: il mazzo si riavvolge, e il punto da
 * cui si rientra si aggiorna.
 *
 * Lo fa **chiunque** noti il cambio, non solo chi ha fatto il commit. È qualche
 * `PUT` in più su un oggetto che cambia di rado — in MLS l'epoch si muove sui
 * commit, non sui messaggi — e in cambio il punto di rientro non resta indietro
 * perché la scheda di chi ha committato si è chiusa un attimo troppo presto.
 * L'istanza non lascia comunque tornare indietro l'epoch, quindi due depositi
 * insieme non possono far vincere il più vecchio.
 */
async function dopoIlCambioDiEpoch(ctx: Contesto, sessione: Sessione): Promise<void> {
  await riavvolgiMazzo(ctx, sessione);
  await ctx.istanza.salvaPuntoDiRientro(sessione.conversazioneId, {
    epoch: epochDi(sessione.stato),
    groupInfo: b64(await puntoDiRientro(sessione.stato)),
  });
}

async function catenaDi(
  ctx: Contesto,
  stato: ClientState,
  conversazioneId: string,
): Promise<Catena> {
  const avvolto = await ctx.istanza.mazzo(conversazioneId);
  if (avvolto === undefined) {
    return catenaNuova();
  }

  try {
    return svolgi(avvolto.mazzo, await serraturaArchivio(stato));
  } catch {
    // Il mazzo c'è ma non si apre: è di un'epoch che non è la nostra. Si
    // risincronizza prima di riprovare, e non si sovrascrive con uno nuovo —
    // sovrascriverlo perderebbe la cronologia di tutti.
    throw new Error("Il mazzo dell'archivio è di un'altra epoch: sincronizza prima.");
  }
}

/** Apre una conversazione che esiste già su questo dispositivo. */
export async function riprendi(
  ctx: Contesto,
  conversazioneId: string,
): Promise<Sessione | undefined> {
  const stato = await ripristina(ctx, conversazioneId);
  if (stato === undefined) {
    return undefined;
  }

  const catena = await catenaDi(ctx, stato, conversazioneId);
  return sincronizza(ctx, { catena, conversazioneId, stato });
}

/**
 * Crea la conversazione e ci fa entrare qualcuno.
 *
 * `idDiChiEntra` è l'**id** del membro, non il suo nome: il canale di handshake
 * consegna un Welcome confrontando il destinatario con l'id di chi legge
 * ([`repository.ts`](../../../core-api/src/messaggi/repository.ts), `listHandshakePer`).
 * Con il nome il Welcome si deposita senza errori e non arriva a nessuno.
 */
export async function apri(
  ctx: Contesto,
  conversazioneId: string,
  chiEntra: KeyPackage,
  idDiChiEntra: string,
): Promise<Sessione> {
  const creato = await creaConversazione(
    conversazioneId,
    await ctx.io.perNuovaFoglia(),
    ctx.istanza,
  );
  const aggiunta = await aggiungi(creato, chiEntra, ctx.istanza);

  const sessione: Sessione = {
    catena: catenaNuova(),
    conversazioneId,
    stato: aggiunta.stato,
  };

  await salva(ctx, sessione);
  await ctx.istanza.depositaHandshake(conversazioneId, {
    busta: b64(aggiunta.commit),
    epoch: aggiunta.epoch,
    tipo: "commit",
  });
  await ctx.istanza.depositaHandshake(conversazioneId, {
    busta: b64(aggiunta.welcome),
    destinatario: idDiChiEntra,
    epoch: aggiunta.epoch,
    tipo: "welcome",
  });
  await dopoIlCambioDiEpoch(ctx, sessione);

  return sessione;
}

/**
 * Fa entrare qualcuno in una conversazione che esiste già.
 *
 * È l'operazione dei gruppi, e anche quella con cui un secondo dispositivo
 * della stessa persona entra — con una chiave sua, perché MLS rifiuta una
 * chiave di firma che nell'albero c'è già.
 */
export async function aggiungiMembro(
  ctx: Contesto,
  sessione: Sessione,
  chiEntra: KeyPackage,
  idDiChiEntra: string,
): Promise<Sessione> {
  const esito = await aggiungi(sessione.stato, chiEntra, ctx.istanza);
  const aggiornata = { ...sessione, stato: esito.stato };

  await salva(ctx, aggiornata);
  await ctx.istanza.depositaHandshake(sessione.conversazioneId, {
    busta: b64(esito.commit),
    epoch: esito.epoch,
    tipo: "commit",
  });
  await ctx.istanza.depositaHandshake(sessione.conversazioneId, {
    busta: b64(esito.welcome),
    destinatario: idDiChiEntra,
    epoch: esito.epoch,
    tipo: "welcome",
  });
  // La serratura è cambiata con l'epoch: il mazzo va riavvolto, o chi entra non
  // lo apre e la cronologia gli resta chiusa.
  await dopoIlCambioDiEpoch(ctx, aggiornata);

  return aggiornata;
}

/**
 * Entra da un Welcome trovato sul canale.
 *
 * `undefined` quando quel Welcome non chiama nessuna chiave di questo
 * dispositivo. Non è un guasto e non si tira a indovinare: succede a chi ha
 * cancellato il browser, e la via che gli resta è il rientro.
 */
export async function entra(
  ctx: Contesto,
  conversazioneId: string,
  welcome: BustaHandshake,
): Promise<Sessione | undefined> {
  const busta = daB64(welcome.busta);
  const io = await ctx.io.perWelcome(busta);
  if (io === undefined) {
    return undefined;
  }

  const stato = await entraDaWelcome(busta, io, ctx.istanza);
  const catena = await catenaDi(ctx, stato, conversazioneId);
  const sessione: Sessione = { catena, conversazioneId, stato };

  await salva(ctx, sessione);
  await ctx.deposito.scriviCursore(conversazioneId, welcome.id);

  return sessione;
}

export interface EsitoInvio {
  sessione: Sessione;
  /** La busta di trasporto, da mandare come messaggio. */
  busta: string;
}

/**
 * Cifra, e **archivia nello stesso gesto**.
 *
 * Sono le due metà della stessa cosa: il trasporto ha la forward secrecy e fra
 * un'epoch e l'altra quel testo non si riapre più, quindi se non finisce
 * nell'archivio adesso non ci finisce mai.
 */
export async function invia(
  ctx: Contesto,
  sessione: Sessione,
  testo: string,
  idMessaggio: string,
  quando: string,
): Promise<EsitoInvio> {
  const cifrato = await cifra(sessione.stato, testo);
  const aggiornata = { ...sessione, stato: cifrato.stato };
  await salva(ctx, aggiornata);

  const voce = archivia(sessione.catena, testo);
  await ctx.istanza.depositaArchivio(sessione.conversazioneId, [
    { busta: voce.busta, chiaveN: voce.chiaveN, createdAt: quando, id: idMessaggio },
  ]);

  return { busta: b64(cifrato.busta), sessione: aggiornata };
}

export type EsitoRicezione =
  | { kind: "messaggio"; sessione: Sessione; testo: string }
  | { kind: "illeggibile"; sessione: Sessione };

/** Decifra e archivia. Un messaggio che non si apre **resta** illeggibile. */
export async function ricevi(
  ctx: Contesto,
  sessione: Sessione,
  busta: string,
  idMessaggio: string,
  quando: string,
): Promise<EsitoRicezione> {
  const esito = await decifra(sessione.stato, daB64(busta), ctx.istanza);
  const aggiornata = { ...sessione, stato: esito.stato };

  if (esito.kind !== "messaggio") {
    return { kind: "illeggibile", sessione: aggiornata };
  }

  await salva(ctx, aggiornata);
  const voce = archivia(sessione.catena, esito.testo);
  await ctx.istanza.depositaArchivio(sessione.conversazioneId, [
    { busta: voce.busta, chiaveN: voce.chiaveN, createdAt: quando, id: idMessaggio },
  ]);

  return { kind: "messaggio", sessione: aggiornata, testo: esito.testo };
}

export interface RigaCronologia {
  id: string;
  createdAt: string;
  /** `undefined` quando non si apre: è uno stato da mostrare, non una frase. */
  testo: string | undefined;
}

/**
 * La cronologia, dalla più vecchia.
 *
 * È da qui che un dispositivo nuovo ricostruisce quello che si è detto: il
 * trasporto non gliela può dare, perché quelle chiavi non esistono più.
 */
export async function cronologia(ctx: Contesto, sessione: Sessione): Promise<RigaCronologia[]> {
  const righe: RigaCronologia[] = [];
  let dopo: string | undefined;

  for (;;) {
    const pagina = await ctx.istanza.archivio(sessione.conversazioneId, dopo);
    for (const voce of pagina.voci) {
      righe.push({
        createdAt: voce.createdAt,
        id: voce.id,
        testo: rileggi(sessione.catena, voce as VoceCifrata),
      });
    }

    if (pagina.prossimo === undefined) {
      return righe;
    }
    dopo = pagina.prossimo;
  }
}

/**
 * Ruota la catena d'archivio. **Si fa quando qualcuno esce dal gruppo**: chi è
 * uscito conserva le chiavi che aveva — lì la crittografia non può niente — ma
 * non ottiene questa, quindi non legge il seguito.
 */
export async function ruotaArchivio(ctx: Contesto, sessione: Sessione): Promise<Sessione> {
  const aggiornata = { ...sessione, catena: catenaRuotata(sessione.catena) };
  await riavvolgiMazzo(ctx, aggiornata);
  return aggiornata;
}
