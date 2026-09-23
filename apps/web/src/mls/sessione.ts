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
 *    E **solo da chi lo conosce**: un dispositivo che non ha ancora aperto il
 *    mazzo — appena rientrato, o entrato prima che qualcuno lo avvolgesse —
 *    non lo riavvolge e non scrive. Riavvolgere un mazzo che non si conosce
 *    vorrebbe dire sostituirlo con un altro, cioè togliere a tutti la
 *    cronologia.
 *
 * **Il contenuto non viaggia come busta MLS.** Con [ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md)
 * la parola resta nell'archivio della casa di chi scrive, e chi legge la
 * **visita**: MLS serve a sapere chi è membro e a derivare la serratura del
 * mazzo, non a trasportare il testo. Una busta applicativa consegnata in casa
 * d'altri sarebbe la copia che quell'ADR vieta.
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
  configurazione,
  creaConversazione,
  entraDaWelcome,
  epochDi,
  puntoDiRientro,
  rientra,
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
  /** Il punto da cui si rientra, se la conversazione ne ha uno. */
  puntoDiRientro: (
    conversazioneId: string,
  ) => Promise<{ groupInfo: string; epoch: number } | undefined>;
  /**
   * La cronologia ricomposta dalle custodie ([ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) §2),
   * dalla pagina più recente: le voci della propria casa e quelle visitate
   * alla casa di chi le ha scritte.
   */
  cronologia: (conversazioneId: string, prima?: string) => Promise<PaginaRemota>;
  depositaArchivio: (conversazioneId: string, voci: VoceArchivio[]) => Promise<void>;
}

/** Una riga come la ricompone l'istanza: la voce c'è solo se la sua casa ha risposto. */
export interface RigaRemota {
  id: string;
  /** `username@casa`; `null` per il pregresso senza autore attestato. */
  mittente: string | null;
  createdAt: string;
  casa: string;
  stato: "disponibile" | "non-disponibile";
  voce?: { chiaveN: number; busta: string };
}

export interface PaginaRemota {
  righe: RigaRemota[];
  prima?: string;
  /** Le case che non hanno risposto. */
  nonRispondono: string[];
}

export interface Sessione {
  conversazioneId: string;
  stato: ClientState;
  /**
   * La catena d'archivio, se questo dispositivo ha aperto il mazzo.
   *
   * `undefined` non è un guasto: è il dispositivo appena rientrato, che torna
   * nel gruppo prima che qualcuno gli riavvolga il mazzo sotto l'epoch nuova
   * ([S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md)). Finché
   * resta così non si scrive, e il mazzo non si tocca.
   */
  catena: Catena | undefined;
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
  // Chi non conosce il mazzo non lo riavvolge: lo sostituirebbe (regola 3).
  if (sessione.catena === undefined) {
    return;
  }

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

/**
 * Apre il mazzo con la serratura dell'epoch in cui si è.
 *
 * `undefined` in due casi, e nessuno dei due si ripara inventando: il mazzo non
 * c'è ancora, oppure c'è ma è avvolto sotto un'altra epoch. **Non si crea mai un
 * mazzo nuovo qui**: lo fa soltanto chi crea il gruppo. Uno nuovo creato da chi
 * entra sostituirebbe quello vero, e con lui la cronologia di tutti.
 */
async function catenaDi(
  ctx: Contesto,
  stato: ClientState,
  conversazioneId: string,
): Promise<Catena | undefined> {
  const avvolto = await ctx.istanza.mazzo(conversazioneId);
  if (avvolto === undefined || avvolto.epoch !== epochDi(stato)) {
    return undefined;
  }

  try {
    return svolgi(avvolto.mazzo, await serraturaArchivio(stato));
  } catch {
    return undefined;
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

  // Il mazzo si apre **prima** di sincronizzare, se è ancora all'epoch del
  // proprio stato: è così che chi resta indietro lo porta avanti riavvolgendolo
  // sotto l'epoch nuova. Se non si apre adesso, si riprova dopo, all'epoch
  // raggiunta — che è il caso di chi ritrova il mazzo già riavvolto da altri.
  const prima = await catenaDi(ctx, stato, conversazioneId);
  const sincronizzata = await sincronizza(ctx, { catena: prima, conversazioneId, stato });

  return sincronizzata.catena !== undefined
    ? sincronizzata
    : {
        ...sincronizzata,
        catena: await catenaDi(ctx, sincronizzata.stato, conversazioneId),
      };
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

  // Il mazzo nasce qui, e soltanto qui: chi crea il gruppo è l'unico che non
  // trova una cronologia da rispettare.
  const sessione: Sessione = {
    catena: catenaNuova(),
    conversazioneId,
    stato: aggiunta.stato,
  };

  // Il commit va in fila **prima** di salvare lo stato. Se un altro l'ha
  // preceduto sulla stessa epoch la fila lo rifiuta (ADR 0042 §3), e allora
  // qui non deve restare un gruppo che nessun altro conosce.
  await ctx.istanza.depositaHandshake(conversazioneId, {
    busta: b64(aggiunta.commit),
    epoch: aggiunta.epoch,
    tipo: "commit",
  });
  await salva(ctx, sessione);
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

/**
 * Scrive: la voce va nell'archivio della propria casa, e basta.
 *
 * È tutto l'invio ([ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) §2):
 * la casa custodisce, le altre case ricevono il segnaposto, e chi legge
 * visita. Nessuna busta di trasporto parte, perché consegnarla in casa d'altri
 * sarebbe la copia che quell'ADR vieta.
 *
 * Senza catena non si scrive: una voce chiusa con una chiave che nessun altro
 * ha sarebbe un messaggio che nessuno legge, mostrato come mandato.
 */
export async function invia(
  ctx: Contesto,
  sessione: Sessione,
  testo: string,
  idMessaggio: string,
  quando: string,
): Promise<void> {
  if (sessione.catena === undefined) {
    throw new Error(
      "La cronologia di questa conversazione non è ancora arrivata su questo dispositivo.",
    );
  }

  const voce = archivia(sessione.catena, testo);
  await ctx.istanza.depositaArchivio(sessione.conversazioneId, [
    { busta: voce.busta, chiaveN: voce.chiaveN, createdAt: quando, id: idMessaggio },
  ]);
}

export interface RigaCronologia {
  id: string;
  createdAt: string;
  /** `username@casa`, o `null` per il pregresso senza autore attestato. */
  mittente: string | null;
  /**
   * `letta` con il testo; `non-si-apre` quando la voce c'è ma questo dispositivo
   * non ha la chiave; `non-disponibile` quando la casa che la custodisce non
   * risponde. Tre stati da mostrare, non tre frasi da inventare.
   */
  stato: "letta" | "non-si-apre" | "non-disponibile";
  testo?: string;
}

export interface PaginaCronologia {
  righe: RigaCronologia[];
  prima?: string;
  nonRispondono: string[];
}

/**
 * Una pagina di cronologia, dalla più recente, decifrata con la catena.
 *
 * Il testo esiste soltanto qui, in memoria: non si scrive da nessuna parte, ed
 * è la prima delle due assunzioni di client onesto di ADR 0043 §5.
 */
export async function cronologia(
  ctx: Contesto,
  sessione: Sessione,
  prima?: string,
): Promise<PaginaCronologia> {
  const pagina = await ctx.istanza.cronologia(sessione.conversazioneId, prima);

  const righe = pagina.righe.map((riga): RigaCronologia => {
    const base = { createdAt: riga.createdAt, id: riga.id, mittente: riga.mittente };

    if (riga.stato === "non-disponibile" || riga.voce === undefined) {
      return { ...base, stato: "non-disponibile" };
    }

    const testo =
      sessione.catena === undefined
        ? undefined
        : rileggi(sessione.catena, {
            busta: riga.voce.busta,
            chiaveN: riga.voce.chiaveN,
          } as VoceCifrata);

    return testo === undefined
      ? { ...base, stato: "non-si-apre" }
      : { ...base, stato: "letta", testo };
  });

  return {
    nonRispondono: pagina.nonRispondono,
    righe,
    ...(pagina.prima === undefined ? {} : { prima: pagina.prima }),
  };
}

/**
 * Rientra in una conversazione dal punto pubblicato, con una foglia nuova.
 *
 * È ciò che resta a un dispositivo che non ha più lo stato del gruppo — un
 * browser svuotato, un'uscita, un accesso da capo — e non trova un Welcome per
 * sé: la via A di [S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md).
 *
 * **Si torna nel gruppo, non ancora nella cronologia.** Il mazzo è avvolto
 * sotto l'epoch di prima, e si riapre quando un altro membro applica il commit
 * di rientro e lo riavvolge. Fino ad allora la sessione non ha catena, e non si
 * scrive.
 */
export async function rientraIn(
  ctx: Contesto,
  conversazioneId: string,
): Promise<Sessione | undefined> {
  const punto = await ctx.istanza.puntoDiRientro(conversazioneId);
  if (punto === undefined) {
    return undefined;
  }

  const tornata = await rientra(daB64(punto.groupInfo), await ctx.io.perNuovaFoglia(), ctx.istanza);

  await ctx.istanza.depositaHandshake(conversazioneId, {
    busta: b64(tornata.commit),
    epoch: tornata.epoch,
    tipo: "commit",
  });

  const sessione: Sessione = { catena: undefined, conversazioneId, stato: tornata.stato };
  await salva(ctx, sessione);

  return sessione;
}

/**
 * Ruota la catena d'archivio. **Si fa quando qualcuno esce dal gruppo**: chi è
 * uscito conserva le chiavi che aveva — lì la crittografia non può niente — ma
 * non ottiene questa, quindi non legge il seguito.
 */
export async function ruotaArchivio(ctx: Contesto, sessione: Sessione): Promise<Sessione> {
  if (sessione.catena === undefined) {
    throw new Error("Non si ruota una catena che questo dispositivo non ha.");
  }

  const aggiornata = { ...sessione, catena: catenaRuotata(sessione.catena) };
  await riavvolgiMazzo(ctx, aggiornata);
  return aggiornata;
}
