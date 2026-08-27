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
 * 1. **Uscire cancella le chiavi da questo browser** (`clearLocalDeviceIdentity`
 *    al logout). Senza una copia, i messaggi scambiati fin lì non si riaprono
 *    più — su nessun dispositivo, mai. Un pulsante «Esci» che non lo dice è una
 *    cancellazione mascherata da uscita.
 * 2. **La copia non contiene le chat.** Contiene le chiavi. Le conversazioni
 *    stanno sull'istanza e ci restano: chiamarla «backup delle chat» fa credere
 *    a una seconda copia dei messaggi che non esiste.
 *
 * Come i suoi vicini, è una funzione da uno stato a delle parole: niente React,
 * così le parole si possono provare.
 */
import type { Tone } from "../../ui/index.js";

export type StatoChiavi =
  /** Ci sono, e ce n'è una copia: è la situazione a posto. */
  | { kind: "con-copia"; copiaDel: string }
  /** Ci sono, ma solo qui. Un browser chiuso male e sono perse. */
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
}): StatoChiavi {
  if (!condizioni.haChiavi) {
    return { kind: "assenti" };
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
      cosaFare:
        "Apri ESTIA da un indirizzo che comincia per «https://», oppure da «localhost» sulla macchina dove gira l'istanza: le chiavi nascono da sole, una volta, e non dovrai rifarlo.",
      testo:
        "Senza, non puoi leggere né scrivere messaggi privati, e — questa è la parte che non si vede — nessuno può scriverti: chi ci prova riceve un rifiuto. Succede quando si entra da un indirizzo che il browser non considera protetto, perché lì la crittografia è spenta.",
      titolo: "Questo browser non ha le chiavi per i messaggi privati",
      tono: "error",
    };
  }

  if (stato.kind === "senza-copia") {
    return {
      cosaFare:
        "Scegli qui sotto una frase segreta e crea la copia. Ci vogliono dieci secondi e si fa una volta sola.",
      testo:
        "Non ne esiste nessuna copia. Se esci da qui, o se questo browser si svuota, i messaggi che hai scambiato finora non si riapriranno più — su nessun dispositivo.",
      titolo: "Le chiavi ci sono, ma vivono solo in questo browser",
      tono: "neutral",
    };
  }

  return {
    testo: `Ne esiste una copia sull'istanza, aggiornata il ${stato.copiaDel}. Entrando da un browser nuovo potrai rimettere queste stesse chiavi con la tua frase segreta, e ritrovare i messaggi di prima.`,
    titolo: "Le chiavi ci sono, e ne hai una copia",
    tono: "ok",
  };
}

/**
 * Il modello mentale, in due frasi, sempre sotto lo stato.
 *
 * Euristica 10: dove un concetto non è ovvio la spiegazione sta sulla schermata.
 * È l'unica frase che rende sensato tutto il resto della pagina.
 */
export const COME_FUNZIONANO =
  "Le chiavi dei messaggi privati nascono in questo browser e restano qui: non le ha l'istanza, non le ha chi ti scrive, non le ha nessuno. È quello che rende i tuoi messaggi illeggibili anche a chi ospita ESTIA — ed è anche il motivo per cui un browser nuovo non apre, da solo, i messaggi vecchi.";

/**
 * Che cosa si perde uscendo. `undefined` quando non si perde niente.
 *
 * Euristica 5: conferma dove una cancellazione costa cara. Qui costa la
 * cronologia intera, e finora il pulsante non lo diceva.
 */
export function avvisoDiUscita(stato: StatoChiavi): string | undefined {
  if (stato.kind === "con-copia") {
    return undefined;
  }

  if (stato.kind === "assenti") {
    return undefined;
  }

  return "Uscendo, le chiavi spariscono da questo browser. Non ne esiste una copia, quindi i messaggi privati scambiati finora non si riapriranno più: né qui, né altrove, né rientrando con lo stesso account.";
}
