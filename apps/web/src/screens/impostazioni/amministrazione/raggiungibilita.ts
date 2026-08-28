import type { FederatedInstanceView } from "@estia/contracts";

/**
 * Come si dice, a una persona, se un'altra casa c'è.
 *
 * Sta in un modulo suo perché è la parte che si può sbagliare in silenzio: le
 * frasi qui dentro passano typecheck e lint qualunque cosa dicano, e sbagliano
 * soltanto addosso a chi le legge. Con un test si può almeno fissare la
 * distinzione che conta.
 *
 * **«Non lo so ancora» e «non risponde» non sono la stessa cosa**, e mostrarle
 * con le stesse parole è il modo più facile di far preoccupare qualcuno per
 * niente. Il battito di [ADR 0041] guarda **solo** le istanze collegate, quindi
 * per una richiesta in attesa o per una bloccata non esiste nessun «adesso» —
 * e inventarlo sarebbe una diagnosi che nessuno ha fatto.
 */

export type Segnale =
  /** Il battito l'ha raggiunta all'ultimo giro. */
  | "raggiungibile"
  /** Il battito ha provato e non ha ottenuto risposta. */
  | "non-risponde"
  /** Collegata, ma il primo giro non è ancora passato. */
  | "in-ascolto"
  /** Non collegata: il battito non la guarda, e non c'è nessun adesso da dire. */
  | "non-osservata";

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;
const SETTIMANA = 7 * GIORNO;

export function segnaleDi(istanza: FederatedInstanceView): Segnale {
  if (istanza.state !== "collegata") {
    return "non-osservata";
  }

  if (istanza.battito === undefined) {
    return "in-ascolto";
  }

  return istanza.battito.raggiungibile ? "raggiungibile" : "non-risponde";
}

/** Quanto tempo fa, in parole intere: qui la data è il dato, non il contorno. */
export function daQuando(valore: string, adesso: Date = new Date()): string {
  const istante = new Date(valore);
  const trascorso = adesso.getTime() - istante.getTime();

  if (Number.isNaN(trascorso)) {
    return "";
  }

  if (trascorso < MINUTO) {
    return "meno di un minuto fa";
  }

  if (trascorso < ORA) {
    const minuti = Math.floor(trascorso / MINUTO);

    return minuti === 1 ? "un minuto fa" : `${String(minuti)} minuti fa`;
  }

  if (trascorso < GIORNO) {
    const ore = Math.floor(trascorso / ORA);

    return ore === 1 ? "un'ora fa" : `${String(ore)} ore fa`;
  }

  if (trascorso < SETTIMANA) {
    const giorni = Math.floor(trascorso / GIORNO);

    return giorni === 1 ? "ieri" : `${String(giorni)} giorni fa`;
  }

  return `il ${istante.toLocaleDateString("it-IT", { day: "numeric", month: "long" })}`;
}

/** Fra quanto, per l'arretramento: è l'unico posto dove i minuti si vedono. */
export function fraQuanto(valore: string, adesso: Date = new Date()): string {
  const istante = new Date(valore);
  const mancante = istante.getTime() - adesso.getTime();

  if (Number.isNaN(mancante) || mancante <= MINUTO) {
    // Sotto il minuto non si promette un numero: il giro del battito ha una
    // grana sua, e «fra 4 secondi» sarebbe una precisione che non esiste.
    return "a momenti";
  }

  if (mancante < ORA) {
    const minuti = Math.round(mancante / MINUTO);

    return minuti === 1 ? "fra un minuto" : `fra ${String(minuti)} minuti`;
  }

  const ore = Math.round(mancante / ORA);

  return ore === 1 ? "fra un'ora" : `fra ${String(ore)} ore`;
}

/** Due parole per il pallino e per chi legge con lo screen reader. */
export function etichettaDi(segnale: Segnale): string {
  switch (segnale) {
    case "raggiungibile":
      return "Raggiungibile";
    case "non-risponde":
      return "Non risponde";
    case "in-ascolto":
      return "Controllo in arrivo";
    case "non-osservata":
      return "";
  }
}

/**
 * La riga sotto il nome: il dettaglio, **non** lo stato.
 *
 * Lo stato lo dice già il segnale accanto, e ripeterlo qui produceva «Non
 * risponde. Non risponde. Vista…» — un difetto che nessun test di logica trova
 * e che si vede al primo sguardo alla schermata vera. Qui si dice da quando
 * manca, per che strada era passata l'ultima volta, e **quando si riprova**
 * (euristica 9: la prossima mossa, che qui è «nessuna, ci pensa l'istanza»).
 */
export function fraseDi(istanza: FederatedInstanceView, adesso: Date = new Date()): string {
  const segnale = segnaleDi(istanza);

  const via =
    istanza.lastReachedVia === "relay"
      ? ", attraverso un relay"
      : istanza.lastReachedVia === "diretto"
        ? ", per collegamento diretto"
        : "";

  switch (segnale) {
    case "raggiungibile":
      return istanza.lastSeenAt === null
        ? ""
        : `Ha risposto ${daQuando(istanza.lastSeenAt, adesso)}${via}.`;

    case "non-risponde": {
      const riprova =
        istanza.battito === undefined
          ? ""
          : ` Riprovo da solo ${fraQuanto(istanza.battito.prossimoTentativo, adesso)}.`;

      return istanza.lastSeenAt === null
        ? `Non ha mai risposto finora.${riprova}`
        : `Vista l'ultima volta ${daQuando(istanza.lastSeenAt, adesso)}${via}.${riprova}`;
    }

    case "in-ascolto":
      return istanza.lastSeenAt === null
        ? "Il primo controllo parte a momenti."
        : `Vista ${daQuando(istanza.lastSeenAt, adesso)}${via}. Il primo controllo parte a momenti.`;

    case "non-osservata":
      return istanza.lastSeenAt === null
        ? "Mai raggiunta finora."
        : `Vista l'ultima volta ${daQuando(istanza.lastSeenAt, adesso)}${via}.`;
  }
}
