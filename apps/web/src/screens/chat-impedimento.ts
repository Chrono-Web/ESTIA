/**
 * Perché una chat non si può usare, e che cosa dire a chi ci si trova dentro.
 *
 * I messaggi privati hanno due modi di non funzionare che **non sono guasti**:
 * il browser tiene spenta la crittografia su una connessione non protetta, e
 * la persona a cui vuoi scrivere può non avere ancora una chiave a cui cifrare.
 * In entrambi i casi ESTIA si rifiuta di mandare qualcosa in chiaro
 * ([ADR 0006](../../../../docs/adr/0006-messaggi-privati-end-to-end-o-niente.md)),
 * ed è la cosa giusta — ma finora lo diceva con una frase inglese scritta per
 * chi programma, e lasciava il campo di scrittura acceso.
 *
 * Due euristiche di [`DESIGN_SYSTEM.md`](../../../../docs/DESIGN_SYSTEM.md)
 * §«Euristiche di usabilità» chiedono il contrario, e alla lettera:
 *
 * - la **5** — «niente stati ambigui che sembrano pronti e non lo sono»: un
 *   campo di scrittura acceso verso qualcuno che non può ricevere è esattamente
 *   quello, e si spegne;
 * - la **10** — «dove un concetto non è ovvio, la spiegazione sta **sulla
 *   schermata**, non in una guida da cercare»: le chiavi sono il concetto meno
 *   ovvio di tutto il prodotto, e il posto dove spiegarle è il centro della chat
 *   nel momento in cui bloccano qualcosa.
 *
 * Qui non c'è React di proposito: è una funzione da uno stato a delle parole, e
 * le parole sono la cosa che vale la pena provare con un test.
 */
import { ApiError } from "../api.js";

export type Impedimento =
  | { kind: "nessuno" }
  /** Il browser tiene spenta la crittografia: riguarda te, e blocca tutto. */
  | { kind: "connessione-non-sicura" }
  /** Chi legge non ha ancora una chiave: non c'è niente a cui cifrare. */
  | { kind: "destinatario-senza-dispositivo"; nome: string }
  /**
   * La casa di chi legge non risponde. **Non è la stessa cosa** di sopra, e
   * confonderle manda a cercare un problema che non esiste: lì manca una
   * chiave, qui manca una macchina accesa. Da quando le istanze si tengono
   * d'occhio ([ADR 0041](../../../../docs/adr/0041-le-istanze-si-tengono-d-occhio.md))
   * questa risposta arriva in fretta.
   */
  | { kind: "casa-non-risponde"; nome: string }
  /**
   * La conversazione l'ha aperta l'altra persona dalla sua casa, e l'invito
   * per questo dispositivo non è ancora arrivato. Non si crea un gruppo da qui:
   * due gruppi per la stessa conversazione sono una corsa che uno perde
   * ([ADR 0042](../../../../docs/adr/0042-come-mls-attraversa.md) §3).
   */
  | { kind: "in-attesa"; nome: string }
  /**
   * Questo dispositivo è appena entrato nella conversazione — un browser
   * svuotato, un'uscita, un dispositivo nuovo — e la chiave per leggerla
   * gliela riconsegna un altro partecipante quando la riapre
   * ([S3](../../../../docs/spike/S3-il-rientro-di-un-dispositivo.md)).
   * Finché non succede non si legge e **non si scrive**: una riga chiusa con
   * una chiave che nessun altro ha sarebbe un messaggio che nessuno legge.
   */
  | { kind: "cronologia-in-arrivo"; nome: string };

export interface Spiegazione {
  titolo: string;
  /** Perché, detto a chi non sa che cosa sia una chiave. */
  testo: string;
  /** La prossima mossa. Sempre presente: un vicolo cieco è un difetto (euristica 3). */
  cosaFare: string;
  /** Che cosa dice il campo di scrittura mentre è spento. */
  segnaposto: string;
}

/**
 * Che cosa impedisce questa conversazione, se qualcosa la impedisce.
 *
 * L'ordine conta: la connessione vince sul resto, perché è l'unica che blocca
 * anche la lettura, e perché è l'unica su cui chi la sta guardando può agire
 * da solo.
 */
export function impedimentoDi(condizioni: {
  crittografiaDisponibile: boolean;
  /** Quello che è tornato provando ad aprire la conversazione. */
  erroreChiave?: unknown;
  nomeDestinatario: string;
  /** La conversazione è ordinata altrove, e l'invito non è ancora arrivato. */
  inAttesa?: boolean;
  /** Questo dispositivo è nella conversazione, ma non ne ha ancora la chiave per leggerla. */
  senzaCronologia?: boolean;
}): Impedimento {
  if (!condizioni.crittografiaDisponibile) {
    return { kind: "connessione-non-sicura" };
  }

  // Si guarda il codice, non il testo: il testo dell'istanza può cambiare, e
  // una schermata che riconosce un errore dalla sua frase si rompe in silenzio.
  if (condizioni.erroreChiave instanceof ApiError) {
    if (condizioni.erroreChiave.code === "no_device_available") {
      return { kind: "destinatario-senza-dispositivo", nome: condizioni.nomeDestinatario };
    }

    // Due codici per la stessa cosa vista da due lati: la casa di chi si
    // invita, o la casa che mette in fila la conversazione. Per chi guarda è
    // una macchina spenta dall'altra parte, e si dice così.
    if (
      condizioni.erroreChiave.code === "istanza_non_raggiungibile" ||
      condizioni.erroreChiave.code === "casa_che_ordina_non_raggiungibile"
    ) {
      return { kind: "casa-non-risponde", nome: condizioni.nomeDestinatario };
    }
  }

  if (condizioni.inAttesa === true) {
    return { kind: "in-attesa", nome: condizioni.nomeDestinatario };
  }

  if (condizioni.senzaCronologia === true) {
    return { kind: "cronologia-in-arrivo", nome: condizioni.nomeDestinatario };
  }

  return { kind: "nessuno" };
}

/** Le parole. `undefined` quando non c'è niente da spiegare. */
export function spiegazioneDi(impedimento: Impedimento): Spiegazione | undefined {
  if (impedimento.kind === "connessione-non-sicura") {
    return {
      cosaFare:
        "Apri ESTIA da un indirizzo che comincia per «https://», oppure da «localhost» sulla macchina dove gira l'istanza. Le altre parti di ESTIA funzionano lo stesso: sono solo i messaggi privati a fermarsi qui.",
      segnaposto: "Qui non si possono scrivere messaggi privati",
      testo:
        "Il browser tiene spenta la crittografia quando l'indirizzo non è protetto, e i messaggi privati senza crittografia ESTIA non li manda. Da questa connessione non puoi né leggere né scrivere — e finché entri da qui, nessuno può scriverti.",
      titolo: "Su questa connessione i messaggi privati non funzionano",
    };
  }

  if (impedimento.kind === "destinatario-senza-dispositivo") {
    return {
      cosaFare: `Faglielo sapere per un'altra via: le basta entrare in ESTIA una volta da un indirizzo «https://» o da «localhost». Da quel momento potrai scriverle, e non dovrà rifarlo mai più.`,
      segnaposto: `${impedimento.nome} non può ancora ricevere messaggi`,
      testo: `Un messaggio privato si chiude con una chiave che nasce sul dispositivo di chi lo legge, e ${impedimento.nome} non ne ha ancora una. Non c'è niente a cui cifrare, ed ESTIA non manda messaggi in chiaro — nemmeno una volta.`,
      titolo: `Non puoi ancora scrivere a ${impedimento.nome}`,
    };
  }

  if (impedimento.kind === "casa-non-risponde") {
    return {
      cosaFare: `Non devi fare niente qui: l'istanza si accorge da sola di quando quella casa torna, e da lì la conversazione riprende. Se non torna, è ${impedimento.nome} che deve riaccenderla.`,
      segnaposto: `La casa di ${impedimento.nome} non risponde`,
      testo: `I messaggi privati passano da una casa all'altra, e quella di ${impedimento.nome} adesso non risponde — è spenta, o non è raggiungibile da qui. Non è un problema tuo e non è un problema delle chiavi.`,
      titolo: `La casa di ${impedimento.nome} non risponde`,
    };
  }

  if (impedimento.kind === "in-attesa") {
    return {
      cosaFare: `Non devi fare niente: appena ${impedimento.nome} apre la conversazione dalla sua parte, l'invito arriva qui e puoi scrivere.`,
      segnaposto: `In attesa che ${impedimento.nome} apra la conversazione`,
      testo: `Questa conversazione l'ha cominciata ${impedimento.nome} dalla sua casa, e l'invito per questo dispositivo non è ancora arrivato. Senza, qui non si può ancora né leggere né scrivere.`,
      titolo: "La conversazione non è ancora pronta qui",
    };
  }

  if (impedimento.kind === "cronologia-in-arrivo") {
    return {
      cosaFare: `Non devi fare niente: appena ${impedimento.nome} riapre questa conversazione, i messaggi si aprono qui da soli e puoi scrivere.`,
      segnaposto: `Aspetta che ${impedimento.nome} riapra la conversazione`,
      testo: `Questo dispositivo è appena entrato nella conversazione. I messaggi si leggono con una chiave che ti riconsegna un'altra persona della conversazione quando la riapre: finché non succede, qui non si aprono, e scrivere vorrebbe dire mandare qualcosa che nessuno potrebbe leggere.`,
      titolo: "Questa conversazione si sta aprendo su questo dispositivo",
    };
  }

  return undefined;
}

/** Se si può scrivere. È la stessa domanda, dall'altra parte. */
export const siPuoScrivere = (impedimento: Impedimento): boolean => impedimento.kind === "nessuno";
