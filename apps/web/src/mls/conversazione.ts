/**
 * Quello che la schermata chiede, e niente di più.
 *
 * `Messaggi.tsx` non deve sapere che cosa sia un'epoch, un Welcome o una catena
 * di chiavi: chiede di aprire una conversazione, di leggerla e di mandare una
 * riga. Qui sotto quelle richieste diventano i passi che [`sessione`](./sessione.ts)
 * espone — ed è per questo che la schermata resta sottile e questo file è
 * provabile senza React.
 *
 * **La cronologia si visita, non si trasporta** ([ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md)).
 * Chi scrive deposita nella propria casa; chi legge chiede alla propria istanza
 * la cronologia ricomposta dalle custodie, e la decifra qui, in memoria.
 */
import {
  aggiungiMembro,
  apri,
  cronologia,
  entra,
  invia,
  riprendi,
  rientraIn,
  sincronizza,
  type Contesto,
  type RigaCronologia,
  type Sessione,
} from "./sessione.js";
import type { KeyPackage } from "ts-mls";

/** Una riga come la mostra la schermata. */
export interface Riga {
  id: string;
  createdAt: string;
  /** `username@casa`, o `null` per il pregresso senza autore attestato. */
  mittente: string | null;
  stato: RigaCronologia["stato"];
  testo?: string;
  /** L'id del messaggio a cui questa riga risponde, se risponde. */
  risponde?: string;
}

/**
 * Come si è aperta una conversazione su questo dispositivo.
 *
 * Quattro esiti, e la schermata ne mostra quattro diversi: non c'è un «errore»
 * generico dove le cose da fare sono diverse.
 */
export type Apertura =
  | { kind: "pronta"; sessione: Sessione }
  /** La conversazione la ordina un'altra casa, e il nostro Welcome non c'è ancora. */
  | { kind: "in-attesa" };

/** Come si ottiene la chiave d'ingresso di chi si invita, e chi è per la casa che ordina. */
export type Invito = () => Promise<{ keyPackage: KeyPackage; idDiChiEntra: string }>;

/**
 * Apre una conversazione su questo dispositivo, dal caso più comune al più raro.
 *
 * 1. **Si riprende**: questo dispositivo ha già lo stato del gruppo.
 * 2. **Si entra**: c'è un Welcome che chiama una chiave di questo dispositivo.
 * 3. **Si rientra**: il gruppo esiste — c'è un punto di rientro — ma questo
 *    dispositivo non ne ha lo stato e nessun Welcome lo chiama. È il browser
 *    svuotato o l'accesso da capo, la via A di S3.
 * 4. **Si crea**, soltanto se la conversazione la ordina questa casa: chi sta
 *    altrove **aspetta**, perché un gruppo creato da due parti è una corsa che
 *    uno dei due perde (ADR 0042 §3).
 *
 * `invito` si chiama solo nel caso 4, e può fallire: chi lo scrive sa dire
 * perché (nessun dispositivo, casa che non risponde), e la schermata lo dice.
 */
export async function apriConversazione(
  ctx: Contesto,
  conversazione: { id: string; ordinataQui: boolean },
  invito: Invito,
): Promise<Apertura> {
  const ripresa = await riprendi(ctx, conversazione.id);
  if (ripresa !== undefined) {
    return { kind: "pronta", sessione: ripresa };
  }

  // Un Welcome può chiamare una chiave che questo dispositivo non ha più: se
  // ne guardano tutti, e `entra` dice `undefined` invece di tirare a indovinare.
  const pagina = await ctx.istanza.handshakeDopo(conversazione.id);
  for (const busta of pagina.handshake) {
    if (busta.tipo !== "welcome") {
      continue;
    }

    const entrata = await entra(ctx, conversazione.id, busta);
    if (entrata !== undefined) {
      return { kind: "pronta", sessione: entrata };
    }
  }

  const rientrata = await rientraIn(ctx, conversazione.id);
  if (rientrata !== undefined) {
    return { kind: "pronta", sessione: rientrata };
  }

  if (!conversazione.ordinataQui) {
    return { kind: "in-attesa" };
  }

  const { idDiChiEntra, keyPackage } = await invito();
  return { kind: "pronta", sessione: await apri(ctx, conversazione.id, keyPackage, idDiChiEntra) };
}

/** Fa entrare un altro membro in una conversazione che esiste. */
export async function invita(
  ctx: Contesto,
  sessione: Sessione,
  chiEntra: KeyPackage,
  idDiChiEntra: string,
): Promise<Sessione> {
  return aggiungiMembro(ctx, sessione, chiEntra, idDiChiEntra);
}

export interface Lettura {
  sessione: Sessione;
  righe: Riga[];
  /** Da passare per la pagina precedente, se ce n'è una. */
  prima?: string;
  /** Le case che non hanno risposto: le loro righe sono `non-disponibile`. */
  nonRispondono: string[];
}

/**
 * Un giro completo: si applicano gli handshake arretrati, si riapre il mazzo se
 * nel frattempo qualcuno l'ha riavvolto, e si legge una pagina di cronologia.
 */
export async function leggi(ctx: Contesto, sessione: Sessione, prima?: string): Promise<Lettura> {
  // Con la catena in mano basta applicare gli handshake: la catena non dipende
  // dall'epoch, e richiedere il mazzo a ogni giro sarebbe una domanda in più
  // verso la casa che ordina ogni volta che la schermata guarda. Senza catena
  // si riprende da capo, perché è lì che si scopre se qualcuno l'ha riavvolta.
  const aggiornata =
    sessione.catena !== undefined
      ? await sincronizza(ctx, sessione)
      : ((await riprendi(ctx, sessione.conversazioneId)) ?? sessione);
  const pagina = await cronologia(ctx, aggiornata, prima);

  return {
    nonRispondono: pagina.nonRispondono,
    righe: pagina.righe.map(dallaCronologia),
    sessione: aggiornata,
    ...(pagina.prima === undefined ? {} : { prima: pagina.prima }),
  };
}

/**
 * Manda una riga: va nell'archivio della propria casa, e basta.
 *
 * Il testo e la risposta viaggiano insieme dentro la voce cifrata, in una forma
 * versionata: il segnaposto che arriva alle altre case non ne sa niente, ed è
 * giusto così (ADR 0042 §4.1).
 */
export async function manda(
  ctx: Contesto,
  sessione: Sessione,
  riga: { testo: string; risponde?: string },
  idMessaggio: string,
  quando: string,
): Promise<void> {
  const contenuto: Contenuto = {
    t: riga.testo,
    v: 1,
    ...(riga.risponde === undefined ? {} : { r: riga.risponde }),
  };

  await invia(ctx, sessione, JSON.stringify(contenuto), idMessaggio, quando);
}

/** La forma del contenuto dentro la voce. `v` c'è perché un giorno cambierà. */
interface Contenuto {
  v: 1;
  t: string;
  r?: string;
}

function dallaCronologia(riga: RigaCronologia): Riga {
  const base = { createdAt: riga.createdAt, id: riga.id, mittente: riga.mittente };

  if (riga.stato !== "letta" || riga.testo === undefined) {
    return { ...base, stato: riga.stato };
  }

  const contenuto = leggiContenuto(riga.testo);
  if (contenuto === undefined) {
    // Aperto, ma non nella forma che questo client conosce: non si mostra come
    // se fosse testo, si dice che non si apre.
    return { ...base, stato: "non-si-apre" };
  }

  return {
    ...base,
    stato: "letta",
    testo: contenuto.t,
    ...(contenuto.r === undefined ? {} : { risponde: contenuto.r }),
  };
}

function leggiContenuto(testo: string): Contenuto | undefined {
  try {
    const letto = JSON.parse(testo) as Partial<Contenuto>;
    if (letto.v !== 1 || typeof letto.t !== "string") {
      return undefined;
    }

    return {
      t: letto.t,
      v: 1,
      ...(typeof letto.r === "string" ? { r: letto.r } : {}),
    };
  } catch {
    return undefined;
  }
}
