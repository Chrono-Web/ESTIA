import type { IconName } from "../ui/index.js";

export interface Destinazione {
  to: string;
  etichetta: string;
  icona: IconName;
  /** Solo la radice: senza, «Home» resterebbe attiva su ogni percorso. */
  esatta: boolean;
}

/**
 * Le quattro destinazioni, in un posto solo.
 *
 * La barra in basso e la colonna laterale sono due presentazioni della stessa
 * cosa: se l'elenco stesse scritto due volte, prima o poi divergerebbero.
 */
export const DESTINAZIONI: readonly Destinazione[] = [
  { esatta: true, etichetta: "Home", icona: "home", to: "/" },
  { esatta: false, etichetta: "Cerca", icona: "search", to: "/cerca" },
  { esatta: false, etichetta: "Profilo", icona: "user", to: "/profilo" },
  { esatta: false, etichetta: "Impostazioni", icona: "settings", to: "/impostazioni" },
];
