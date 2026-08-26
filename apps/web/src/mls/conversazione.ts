/**
 * Quello che la schermata chiede, e niente di più.
 *
 * `Messaggi.tsx` non deve sapere che cosa sia un'epoch, un Welcome o una catena
 * di chiavi: chiede di aprire una conversazione, di aggiornarla e di mandare una
 * riga. Qui sotto quelle tre richieste diventano gli undici passi che
 * [`sessione`](./sessione.ts) espone — ed è per questo che la schermata resta
 * sottile e questo file è provabile senza React.
 *
 * **La cronologia viene dall'archivio, non dal trasporto.** È il rovesciamento
 * che [ADR 0037](../../../../docs/adr/0037-la-cronologia-e-un-archivio-non-una-chiave.md)
 * impone: con la forward secrecy le buste vecchie non si riaprono più, quindi il
 * trasporto porta **le novità** e l'archivio porta **il passato**. Una schermata
 * che continuasse a decifrare tutte le buste a ogni giro mostrerebbe una
 * cronologia che si accorcia da sola.
 */
import type { MessaggioBustaView } from "@estia/contracts";

import {
  apri,
  aggiungiMembro,
  cronologia,
  entra,
  invia,
  ricevi,
  riprendi,
  sincronizza,
  type Contesto,
  type Sessione,
} from "./sessione.js";
import type { KeyPackage } from "ts-mls";

export interface Riga {
  id: string;
  createdAt: string;
  /** `undefined` quando non si apre: uno stato da mostrare, non una frase. */
  testo: string | undefined;
}

/**
 * Apre una conversazione su questo dispositivo.
 *
 * Tre casi, in ordine di frequenza: la si è già aperta qui (si riprende), non la
 * si è mai aperta ma c'è un Welcome che aspetta (si entra), oppure non c'è
 * niente — e allora non è una conversazione MLS, il che dopo la ritirata di
 * `ESTIA-E2E-v1` vuol dire che è più vecchia del passaggio.
 */
export async function apriEsistente(
  ctx: Contesto,
  conversazioneId: string,
): Promise<Sessione | undefined> {
  const ripresa = await riprendi(ctx, conversazioneId);
  if (ripresa !== undefined) {
    return ripresa;
  }

  // Nessuno stato locale: forse c'è un Welcome che ci aspetta sul canale.
  const pagina = await ctx.istanza.handshakeDopo(conversazioneId);
  const welcome = pagina.handshake.find((h) => h.tipo === "welcome");
  if (welcome === undefined) {
    return undefined;
  }

  // L'albero viaggia dentro il Welcome (`ratchetTreeExtension`): chi entra è
  // precisamente chi non ha ancora niente di questo gruppo.
  return entra(ctx, conversazioneId, welcome);
}

/** Crea il gruppo di una conversazione appena nata. */
export async function apriNuova(
  ctx: Contesto,
  conversazioneId: string,
  chiEntra: KeyPackage,
  usernameChiEntra: string,
): Promise<Sessione> {
  return apri(ctx, conversazioneId, chiEntra, usernameChiEntra);
}

/** Fa entrare un altro membro in una conversazione che esiste. */
export async function invita(
  ctx: Contesto,
  sessione: Sessione,
  chiEntra: KeyPackage,
  usernameChiEntra: string,
): Promise<Sessione> {
  return aggiungiMembro(ctx, sessione, chiEntra, usernameChiEntra);
}

export interface Aggiornamento {
  sessione: Sessione;
  righe: Riga[];
}

/**
 * Un giro completo: si applicano gli handshake arretrati, si decifrano le buste
 * nuove archiviandole, e si rilegge la cronologia.
 *
 * `giaViste` è ciò che evita di ridecifrare — e quindi di riarchiviare — quello
 * che si è già letto. Non è un'ottimizzazione: una busta di un'epoch superata
 * **non si riapre più**, quindi ritentarla produrrebbe solo righe illeggibili.
 */
export async function aggiorna(
  ctx: Contesto,
  sessione: Sessione,
  buste: readonly MessaggioBustaView[],
  giaViste: ReadonlySet<string>,
): Promise<Aggiornamento> {
  let corrente = await sincronizza(ctx, sessione);

  for (const busta of buste) {
    if (giaViste.has(busta.id)) {
      continue;
    }

    const esito = await ricevi(ctx, corrente, busta.busta, busta.id, busta.createdAt);
    corrente = esito.sessione;
  }

  return { righe: await cronologia(ctx, corrente), sessione: corrente };
}

export interface EsitoRiga {
  sessione: Sessione;
  /** La busta da consegnare con `api.inviaMessaggio`. */
  busta: string;
}

/** Manda una riga. Cifra e archivia nello stesso gesto. */
export async function manda(
  ctx: Contesto,
  sessione: Sessione,
  testo: string,
  idMessaggio: string,
  quando: string,
): Promise<EsitoRiga> {
  return invia(ctx, sessione, testo, idMessaggio, quando);
}
