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
 */
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
      cosaFare:
        "Apri ESTIA da un indirizzo che comincia per «https://», oppure da «localhost» sulla macchina dove gira l'istanza: le chiavi nascono da sole, una volta, e non dovrai rifarlo.",
      testo:
        "Senza, non puoi leggere né scrivere messaggi privati, e — questa è la parte che non si vede — nessuno può scriverti: chi ci prova riceve un rifiuto. Succede quando si entra da un indirizzo che il browser non considera protetto, perché lì la crittografia è spenta.",
      titolo: "Questo browser non ha le chiavi per i messaggi privati",
      tono: "error",
    };
  }

  if (stato.kind === "in-attesa") {
    return {
      cosaFare:
        "Apri ESTIA su un dispositivo dove sei già dentro, vai in Impostazioni → Chat, e confronta il codice che vedi lì con quello qui sotto. Se coincidono, di' di sì.",
      testo:
        "Le chiavi ci sono, ma nessuno ha ancora detto che questo dispositivo sei tu. Finché aspetta non entra nelle tue conversazioni, e sul dispositivo che avevi già non cambia niente — non si perde niente.",
      titolo: "Questo dispositivo aspetta il tuo sì",
      tono: "neutral",
    };
  }

  if (stato.kind === "senza-copia") {
    return {
      cosaFare:
        "Scegli qui sotto una frase segreta e crea la copia. Ci vogliono dieci secondi e si fa una volta sola.",
      testo:
        "Non ne esiste nessuna copia. Se esci da qui, o se questo browser si svuota, rientrerai con una chiave nuova: le conversazioni tornano, ma questo browser ci resta come un tuo dispositivo in più, e la cronologia si riapre solo quando le altre persone riaprono ciascuna conversazione.",
      titolo: "Le chiavi ci sono, ma vivono solo in questo browser",
      tono: "neutral",
    };
  }

  return {
    testo: `Ne esiste una copia sull'istanza, aggiornata il ${stato.copiaDel}. Entrando da un browser nuovo potrai rimettere questa stessa chiave con la tua frase segreta, e rientrare nelle conversazioni al posto del browser di prima.`,
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
  "Le chiavi dei messaggi privati nascono in questo browser e restano qui: non le ha l'istanza, non le ha chi ti scrive, non le ha nessuno. È quello che rende i tuoi messaggi illeggibili anche a chi ospita ESTIA — ed è anche il motivo per cui un browser nuovo non apre, da solo, i messaggi vecchi: glieli riapre un'altra persona della conversazione, la prima volta che la riapre.";

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
export const PIU_DISPOSITIVI =
  "Puoi usare ESTIA da più dispositivi insieme: ognuno, una volta autorizzato, entra da solo in ciascuna conversazione la prima volta che la apri, e gli altri restano accesi. Su un dispositivo appena entrato, la cronologia di una conversazione si apre quando un'altra persona di quella conversazione la riapre.";

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

  return "Uscendo, la chiave sparisce da questo browser, e non ne esiste una copia. Rientrando ne nascerà una nuova: ritroverai le conversazioni, ma la cronologia si riaprirà solo quando le altre persone le riapriranno, e questo browser ci resterà come un tuo dispositivo in più.";
}
