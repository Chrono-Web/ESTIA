/**
 * Le chiavi dei messaggi privati, raccontate a chi non sa che cosa sia una chiave.
 *
 * Fino a oggi la stessa cosa veniva spiegata in tre posti con tre voci diverse —
 * queste impostazioni, la schermata di rientro, il pannello dentro la chat — e
 * nessuno dei tre diceva la cosa che serve davvero sapere: **le chiavi vivono
 * nel browser, e in nessun altro posto.** Da lì discende tutto il resto, e senza
 * quella frase «backup», «passphrase» e «ripristina» sono tre parole in fila.
 *
 * Due cose che il testo qui dentro non deve smettere di dire, perché sono vere e
 * costano care:
 *
 * 1. **Uscire cancella la chiave da questo browser** (`esci` in
 *    [`mls/motore.ts`](../../mls/motore.ts)). Con MLS e la custodia di
 *    [ADR 0043](../../../../docs/adr/0043-custodia-lato-mittente.md) non si perde
 *    più la cronologia: si rientra con una chiave nuova, e la cronologia torna
 *    quando un altro partecipante riapre la conversazione. Quello che costa è
 *    diverso, e va detto lo stesso: senza la copia, il browser di prima resta
 *    nelle conversazioni come un dispositivo in più.
 * 2. **La copia non contiene le chat.** Contiene le chiavi. Le conversazioni
 *    stanno sull'istanza e ci restano: chiamarla «backup delle chat» fa credere
 *    a una seconda copia dei messaggi che non esiste.
 *
 * Come i suoi vicini, è una funzione da uno stato a delle parole: niente React,
 * così le parole si possono provare.
 *
 * Le parole stanno nel catalogo `settings` (ADR 0044), sotto `keys.*`, e si
 * leggono a ogni chiamata: per questo anche i due testi fissi sono funzioni e
 * non costanti, che resterebbero nella lingua del caricamento.
 */
import { t } from "../../i18n/index.js";
import type { Tone } from "../../ui/index.js";

export type StatoChiavi =
  /** Ci sono, e ce n'è una copia: è la situazione a posto. */
  | { kind: "con-copia"; copiaDel: string }
  /**
   * Ci sono, ma questo dispositivo aspetta un sì
   * ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)).
   * Finché aspetta non è nel registro, quindi non può entrare nelle
   * conversazioni: sul dispositivo che avevi già non cambia niente.
   */
  | { kind: "in-attesa" }
  /** Ci sono, ma solo qui. Un browser svuotato, e al rientro ne nasce una nuova. */
  | { kind: "senza-copia" }
  /**
   * Non ci sono affatto. È il caso che rende una persona **irraggiungibile**
   * senza che se ne accorga: nessuno può scriverle, perché non c'è niente a cui
   * cifrare.
   */
  | { kind: "assenti" };

export function statoChiaviDi(condizioni: {
  haChiavi: boolean;
  /** Quando è stata aggiornata la copia, se esiste. */
  copiaDel?: string | undefined;
  /** Questo dispositivo ha le chiavi ma nessuno gli ha ancora detto di sì. */
  inAttesa?: boolean;
}): StatoChiavi {
  if (!condizioni.haChiavi) {
    return { kind: "assenti" };
  }

  // Prima della copia: non ha senso proporre di mettere al sicuro delle chiavi
  // che non stanno ancora servendo a niente.
  if (condizioni.inAttesa === true) {
    return { kind: "in-attesa" };
  }

  return condizioni.copiaDel === undefined
    ? { kind: "senza-copia" }
    : { kind: "con-copia", copiaDel: condizioni.copiaDel };
}

export interface Racconto {
  tono: Tone;
  titolo: string;
  testo: string;
  /** La prossima mossa, quando ce n'è una da fare. */
  cosaFare?: string;
}

/**
 * Che cosa vive in questo browser, sempre visibile e non solo quando è rotto.
 *
 * Euristica 6, «riconoscere piuttosto che ricordare»: lo stato si vede senza
 * doversi ricordare di aprire la sezione giusta.
 */
export function raccontoDi(stato: StatoChiavi): Racconto {
  if (stato.kind === "assenti") {
    return {
      cosaFare: t("settings.keys.missing.next"),
      testo: t("settings.keys.missing.text"),
      titolo: t("settings.keys.missing.title"),
      tono: "error",
    };
  }

  if (stato.kind === "in-attesa") {
    return {
      cosaFare: t("settings.keys.waiting.next"),
      testo: t("settings.keys.waiting.text"),
      titolo: t("settings.keys.waiting.title"),
      tono: "neutral",
    };
  }

  if (stato.kind === "senza-copia") {
    return {
      cosaFare: t("settings.keys.no_copy.next"),
      testo: t("settings.keys.no_copy.text"),
      titolo: t("settings.keys.no_copy.title"),
      tono: "neutral",
    };
  }

  return {
    testo: t("settings.keys.with_copy.text", { date: stato.copiaDel }),
    titolo: t("settings.keys.with_copy.title"),
    tono: "ok",
  };
}

/**
 * Il modello mentale, in due frasi, sempre sotto lo stato.
 *
 * Euristica 10: dove un concetto non è ovvio la spiegazione sta sulla schermata.
 * È l'unica frase che rende sensato tutto il resto della pagina.
 */
export function comeFunzionano(): string {
  return t("settings.keys.how_it_works");
}

/**
 * Più dispositivi, detto invece di lasciarlo scoprire cambiando stanza.
 *
 * Fino al taglio MLS un messaggio si cifrava per **una** chiave del
 * destinatario, e un secondo dispositivo spegneva il primo. Con MLS ogni
 * dispositivo è una foglia del gruppo
 * ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)):
 * un dispositivo autorizzato entra da solo in ciascuna conversazione la prima
 * volta che la apre, e gli altri restano accesi. Il costo che resta è quello di
 * ogni rientro, e va detto: la cronologia su quel dispositivo si apre quando un
 * altro partecipante riapre la conversazione.
 */
export function piuDispositivi(): string {
  return t("settings.keys.many_devices");
}

/**
 * Che cosa si perde uscendo. `undefined` quando non si perde niente.
 *
 * Euristica 5: conferma dove una cancellazione costa. Con MLS non costa più la
 * cronologia, ma qualcosa sì: senza copia si rientra con una chiave nuova, e
 * questo browser resta nelle conversazioni come un dispositivo in più.
 */
export function avvisoDiUscita(stato: StatoChiavi): string | undefined {
  // Con una copia non si perde niente; senza chiavi o in attesa non c'è ancora
  // niente da perdere.
  if (stato.kind !== "senza-copia") {
    return undefined;
  }

  return t("settings.keys.sign_out_warning");
}
