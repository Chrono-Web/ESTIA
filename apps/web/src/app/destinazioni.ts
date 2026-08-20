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
 *
 * «Profilo» punta al proprio indirizzo pubblico e non a un `/profilo` privato,
 * e non è un dettaglio: il proprio profilo **è** la propria pagina, la stessa
 * che vedono gli altri. Se puntasse altrove, la voce non risulterebbe attiva
 * proprio mentre la si sta guardando.
 */
export function destinazioni(username: string): readonly Destinazione[] {
  return [
    { esatta: true, etichetta: "Home", icona: "home", to: "/" },
    { esatta: false, etichetta: "Cerca", icona: "search", to: "/cerca" },
    { esatta: false, etichetta: "Profilo", icona: "user", to: `/@${username}` },
    { esatta: false, etichetta: "Impostazioni", icona: "settings", to: "/impostazioni" },
  ];
}
