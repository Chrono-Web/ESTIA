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

  if (trascorso < MINUTO) {
    return "adesso";
  }

  if (trascorso < ORA) {
    return `${String(Math.floor(trascorso / MINUTO))} min`;
  }

  if (trascorso < GIORNO) {
    return `${String(Math.floor(trascorso / ORA))} h`;
  }

  if (trascorso < SETTIMANA) {
    const giorni = Math.floor(trascorso / GIORNO);

    return giorni === 1 ? "ieri" : `${String(giorni)} g`;
  }

  return istante.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    ...(istante.getFullYear() === adesso.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function quandoPerEsteso(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" });
}
