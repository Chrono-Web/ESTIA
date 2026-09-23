import { t } from "../i18n/index.js";
import type { IconName } from "../ui/index.js";

export type IdDestinazione =
  "home" | "cerca" | "messaggi" | "crea" | "notifiche" | "profilo" | "impostazioni";

export interface Destinazione {
  /**
   * Stabile, e non si vede. La sidebar raggruppa le voci per questo e non per
   * l'etichetta: l'etichetta cambia con la lingua (ADR 0044).
   */
  id: IdDestinazione;
  to: string;
  etichetta: string;
  icona: IconName;
  /** Solo la radice: senza, «Home» resterebbe attiva su ogni percorso. */
  esatta: boolean;
  /**
   * Dove compare. La barra in basso ha cinque posti fissi (stile Threads);
   * la sidebar desktop ne mostra di più (cerca, altro).
   */
  dove: "primaria" | "desktop";
}

/**
 * Le destinazioni di navigazione, in un posto solo.
 *
 * Mobile: cinque voci in basso — home, messaggi, crea, notifiche, profilo —
 * più cerca e impostazioni in alto (cerca a destra, menù a sinistra).
 * Desktop: le stesse voci, espanse nella sidebar, con cerca e impostazioni
 * insieme a loro.
 *
 * Messaggi e notifiche esistono come destinazione anche se la funzione non c'è
 * ancora: una voce che dice onestamente «non ancora» batte nasconderla.
 *
 * Una funzione e non una costante anche per le etichette: si scrivono nella
 * lingua di chi guarda **adesso**, non in quella del caricamento del modulo.
 */
export function destinazioni(username: string): readonly Destinazione[] {
  return [
    {
      dove: "primaria",
      esatta: true,
      etichetta: t("nav.destination.home"),
      icona: "home",
      id: "home",
      to: "/",
    },
    {
      dove: "desktop",
      esatta: false,
      etichetta: t("nav.destination.search"),
      icona: "search",
      id: "cerca",
      to: "/cerca",
    },
    {
      dove: "primaria",
      esatta: true,
      etichetta: t("nav.destination.messages"),
      icona: "send",
      id: "messaggi",
      to: "/messaggi",
    },
    {
      dove: "primaria",
      esatta: true,
      etichetta: t("nav.destination.create"),
      icona: "plus",
      id: "crea",
      to: "/scrivi",
    },
    {
      dove: "primaria",
      esatta: true,
      etichetta: t("nav.destination.notifications"),
      icona: "bell",
      id: "notifiche",
      to: "/notifiche",
    },
    {
      dove: "primaria",
      esatta: false,
      etichetta: t("nav.destination.profile"),
      icona: "user",
      id: "profilo",
      to: `/@${username}`,
    },
    {
      dove: "desktop",
      esatta: false,
      etichetta: t("nav.destination.settings"),
      icona: "settings",
      id: "impostazioni",
      to: "/impostazioni",
    },
  ];
}

export function destinazioniPrimarie(username: string): readonly Destinazione[] {
  return destinazioni(username).filter((d) => d.dove === "primaria");
}
