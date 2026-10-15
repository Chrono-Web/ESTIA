import {
  esisteLingua,
  traduci,
  traduciPlurale,
  type BasePlurale,
  type Chiave,
  type Valori,
} from "@estia/lingue";
import { Fragment, createElement, useSyncExternalStore, type ReactNode } from "react";

/**
 * La lingua dell'interfaccia (ADR 0046).
 *
 * Una sola, per tutta la pagina, e sta in un posto solo: l'attributo `lang`
 * della radice, che dice anche al lettore di schermo come pronunciare il testo.
 * La sceglie la persona fra le preferenze (ADR 0024); chi non ha scelto legge
 * quella della Casa, che per ora è quella dichiarata da `index.html`.
 *
 * I componenti leggono le frasi con `useT()`, che li fa ridisegnare quando la
 * lingua cambia; il codice fuori da React con `t()`, che legge quella di ora.
 */

const ascoltatori = new Set<() => void>();

function linguaDellaCasa(): string {
  const lang = typeof document === "undefined" ? "" : document.documentElement.lang;
  return lang !== "" && esisteLingua(lang) ? lang : "it";
}

/** Quella di chi non ha scelto, letta una volta prima che una scelta la cambi. */
export const LINGUA_DELLA_CASA = linguaDellaCasa();
let corrente = LINGUA_DELLA_CASA;

export function linguaCorrente(): string {
  return corrente;
}

/** La lingua scelta dalla persona; `undefined` torna a quella della Casa. */
export function impostaLingua(codice: string | undefined): void {
  const nuova = codice !== undefined && esisteLingua(codice) ? codice : LINGUA_DELLA_CASA;

  if (nuova === corrente) {
    return;
  }

  corrente = nuova;
  if (typeof document !== "undefined") {
    document.documentElement.lang = nuova;
  }
  for (const ascolta of ascoltatori) {
    ascolta();
  }
}

export function t(chiave: Chiave, valori?: Valori): string {
  return traduci(corrente, chiave, valori);
}

export function tn(base: BasePlurale, n: number, valori?: Valori): string {
  return traduciPlurale(corrente, base, n, valori);
}

/**
 * Una frase con dentro un pezzo d'interfaccia — un link, un grassetto — al
 * posto di un segnaposto. La frase resta intera nella tabella, perché l'ordine
 * delle parole intorno al link cambia da una lingua all'altra.
 */
export function tc(chiave: Chiave, nodi: Readonly<Record<string, ReactNode>>): ReactNode {
  const pezzi = traduci(corrente, chiave).split(/\{(\w+)\}/);

  return createElement(
    Fragment,
    null,
    ...pezzi.map((pezzo, i) =>
      // Le posizioni dispari sono i nomi dei segnaposti.
      createElement(Fragment, { key: i }, i % 2 === 1 ? (nodi[pezzo] ?? `{${pezzo}}`) : pezzo),
    ),
  );
}

function iscrivi(ascolta: () => void): () => void {
  ascoltatori.add(ascolta);
  return () => ascoltatori.delete(ascolta);
}

/** Le frasi per un componente, che si ridisegna quando la lingua cambia. */
export function useT(): { t: typeof t; tn: typeof tn; tc: typeof tc; lingua: string } {
  const lingua = useSyncExternalStore(iscrivi, linguaCorrente, linguaCorrente);
  return { t, tn, tc, lingua };
}
