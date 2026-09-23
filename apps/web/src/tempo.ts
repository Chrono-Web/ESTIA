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
 */

import { formatoData, t } from "./i18n/index.js";

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
    return t("time.now");
  }

  if (trascorso < ORA) {
    return t("time.minutes", { count: Math.floor(trascorso / MINUTO) });
  }

  if (trascorso < GIORNO) {
    return t("time.hours", { count: Math.floor(trascorso / ORA) });
  }

  if (trascorso < SETTIMANA) {
    const giorni = Math.floor(trascorso / GIORNO);

    return giorni === 1 ? t("time.yesterday") : t("time.days", { count: giorni });
  }

  return formatoData(istante, {
    day: "numeric",
    month: "short",
    // L'anno solo quando non è questo: dentro l'anno corrente è ridondante.
    ...(istante.getFullYear() === adesso.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Per esteso: il `title`, e ovunque la data sia il dato e non il contorno. */
export function quandoPerEsteso(valore: string): string {
  return formatoData(valore, { dateStyle: "long", timeStyle: "short" });
}
