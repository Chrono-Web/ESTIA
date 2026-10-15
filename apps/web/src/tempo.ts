/**
 * Quando è successo, detto come lo direbbe una persona.
 *
 * «2 h» invece di una data intera: in un feed la distanza dal presente è
 * l'unica cosa che si sta chiedendo davvero, e una data per esteso su ogni
 * scheda è rumore che si legge dodici volte per schermata.
 *
 * Oltre la settimana si torna alla data: «37 giorni fa» non è più una risposta,
 * è un'aritmetica da fare a mente.
 *
 * La data completa non sparisce mai — sta nel `title` e nell'attributo
 * `dateTime` di `<time>`, quindi resta a portata di puntatore e di programma.
 *
 * Tutto nella lingua dell'interfaccia (ADR 0046): le abbreviazioni dalla
 * tabella, le date da `Intl`, che sa come le scrive ogni lingua.
 */

import { linguaCorrente, t } from "./lingua.js";

const MINUTO = 60_000;
const ORA = 60 * MINUTO;
const GIORNO = 24 * ORA;
const SETTIMANA = 7 * GIORNO;

export function quandoBreve(valore: string, adesso: Date = new Date()): string {
  const istante = new Date(valore);
  const trascorso = adesso.getTime() - istante.getTime();

  if (Number.isNaN(trascorso)) {
    return "";
  }

  // Un orologio leggermente avanti non deve produrre «fra 3 secondi».
  if (trascorso < MINUTO) {
    return t("tempo.adesso");
  }

  if (trascorso < ORA) {
    return t("tempo.minuti", { n: Math.floor(trascorso / MINUTO) });
  }

  if (trascorso < GIORNO) {
    return t("tempo.ore", { n: Math.floor(trascorso / ORA) });
  }

  if (trascorso < SETTIMANA) {
    const giorni = Math.floor(trascorso / GIORNO);

    return giorni === 1 ? t("tempo.ieri") : t("tempo.giorni", { n: giorni });
  }

  return istante.toLocaleDateString(linguaCorrente(), {
    day: "numeric",
    month: "short",
    // L'anno solo quando non è questo: dentro l'anno corrente è ridondante.
    ...(istante.getFullYear() === adesso.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Per esteso: il `title`, e ovunque la data sia il dato e non il contorno. */
export function quandoPerEsteso(valore: string): string {
  return new Date(valore).toLocaleString(linguaCorrente(), {
    dateStyle: "long",
    timeStyle: "short",
  });
}

/** Data e ora in breve: gli elenchi di dispositivi, inviti, archivi. */
export function quandoMedio(valore: string): string {
  return new Date(valore).toLocaleString(linguaCorrente(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Al secondo: quando l'ora esatta è il dato, come l'invio di un messaggio. */
export function quandoPreciso(valore: string): string {
  return new Date(valore).toLocaleString(linguaCorrente(), {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

/** Solo l'ora, accanto a un messaggio della giornata. */
export function ora(valore: string): string {
  return new Date(valore).toLocaleTimeString(linguaCorrente(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** «agosto 2026»: da quando una persona è qui. */
export function meseEAnno(valore: string): string {
  return new Date(valore).toLocaleDateString(linguaCorrente(), { month: "long", year: "numeric" });
}

/** «26 agosto»: un giorno di quest'anno detto per esteso. */
export function giornoEMese(istante: Date): string {
  return istante.toLocaleDateString(linguaCorrente(), { day: "numeric", month: "long" });
}
