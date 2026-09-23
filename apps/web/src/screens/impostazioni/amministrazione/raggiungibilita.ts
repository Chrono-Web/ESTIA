import type { FederatedInstanceView } from "@estia/contracts";

import { formatoData, t } from "../../../i18n/index.js";

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
 *
 * Le frasi stanno nel catalogo `network` (ADR 0044). La strada — relay,
 * collegamento diretto, nessuna nota — non è un pezzo incollato in coda: ogni
 * frase ha una variante intera per ciascuna, perché un'altra lingua può volerla
 * in un altro punto della frase.
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
    return t("network.when.ago.now");
  }

  if (trascorso < ORA) {
    return t("network.when.ago.minutes", { count: Math.floor(trascorso / MINUTO) });
  }

  if (trascorso < GIORNO) {
    return t("network.when.ago.hours", { count: Math.floor(trascorso / ORA) });
  }

  if (trascorso < SETTIMANA) {
    const giorni = Math.floor(trascorso / GIORNO);

    return giorni === 1
      ? t("network.when.ago.yesterday")
      : t("network.when.ago.days", { count: giorni });
  }

  return t("network.when.ago.date", {
    date: formatoData(istante, { day: "numeric", month: "long" }),
  });
}

/** Fra quanto, per l'arretramento: è l'unico posto dove i minuti si vedono. */
export function fraQuanto(valore: string, adesso: Date = new Date()): string {
  const istante = new Date(valore);
  const mancante = istante.getTime() - adesso.getTime();

  if (Number.isNaN(mancante) || mancante <= MINUTO) {
    // Sotto il minuto non si promette un numero: il giro del battito ha una
    // grana sua, e «fra 4 secondi» sarebbe una precisione che non esiste.
    return t("network.when.in.soon");
  }

  if (mancante < ORA) {
    return t("network.when.in.minutes", { count: Math.round(mancante / MINUTO) });
  }

  return t("network.when.in.hours", { count: Math.round(mancante / ORA) });
}

/** Due parole per il pallino e per chi legge con lo screen reader. */
export function etichettaDi(segnale: Segnale): string {
  switch (segnale) {
    case "raggiungibile":
      return t("network.reach.label.reachable");
    case "non-risponde":
      return t("network.reach.label.silent");
    case "in-ascolto":
      return t("network.reach.label.waiting");
    case "non-osservata":
      return "";
  }
}

/** Per che strada era passata l'ultima volta, se si sa. */
type Via = "diretto" | "relay" | "ignota";

const HA_RISPOSTO = {
  diretto: "network.reach.answered.direct",
  ignota: "network.reach.answered.plain",
  relay: "network.reach.answered.relay",
} as const satisfies Record<Via, string>;

const VISTA_L_ULTIMA_VOLTA = {
  diretto: "network.reach.last_seen.direct",
  ignota: "network.reach.last_seen.plain",
  relay: "network.reach.last_seen.relay",
} as const satisfies Record<Via, string>;

const VISTA = {
  diretto: "network.reach.seen.direct",
  ignota: "network.reach.seen.plain",
  relay: "network.reach.seen.relay",
} as const satisfies Record<Via, string>;

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
  const via: Via = istanza.lastReachedVia ?? "ignota";
  const quando = (valore: string): string => daQuando(valore, adesso);

  switch (segnale) {
    case "raggiungibile":
      return istanza.lastSeenAt === null
        ? ""
        : t(HA_RISPOSTO[via], { when: quando(istanza.lastSeenAt) });

    case "non-risponde": {
      const vista =
        istanza.lastSeenAt === null
          ? t("network.reach.never_answered")
          : t(VISTA_L_ULTIMA_VOLTA[via], { when: quando(istanza.lastSeenAt) });

      // Due frasi intere una dopo l'altra, non una frase fatta a pezzi.
      return istanza.battito === undefined
        ? vista
        : `${vista} ${t("network.reach.retry", {
            when: fraQuanto(istanza.battito.prossimoTentativo, adesso),
          })}`;
    }

    case "in-ascolto":
      return istanza.lastSeenAt === null
        ? t("network.reach.first_check")
        : `${t(VISTA[via], { when: quando(istanza.lastSeenAt) })} ${t("network.reach.first_check")}`;

    case "non-osservata":
      return istanza.lastSeenAt === null
        ? t("network.reach.never_reached")
        : t(VISTA_L_ULTIMA_VOLTA[via], { when: quando(istanza.lastSeenAt) });
  }
}
