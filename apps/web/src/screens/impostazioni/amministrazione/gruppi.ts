import type { FederatedInstanceView } from "@estia/contracts";

import type { IconName } from "../../../ui/index.js";

/**
 * In che punto della sua storia sta una casa, e come si riconosce a colpo
 * d'occhio.
 *
 * Sta in un modulo suo perché è la parte più ramificata della schermata e
 * viveva dentro il JSX, dove nessun test la vedeva: quali azioni valgono per
 * quale stato è precisamente la cosa che si sbaglia aggiungendone una.
 *
 * **Quattro gruppi, tre colori.** Nelle impostazioni `AppShell` mette
 * `data-neutro` e `--accent` diventa `--text`: restano `--text-soft`, `--ok` e
 * `--danger` più il testo pieno. Il quarto gruppo non prende un colore
 * inventato — prende il testo pieno, ed è comunque il primo dell'elenco. La
 * distinzione che regge sempre, anche in bianco e nero, è la **forma**
 * dell'icona.
 */

export type Gruppo = "in-arrivo" | "in-attesa" | "collegata" | "bloccata";

export interface AspettoGruppo {
  titolo: string;
  icona: IconName;
  /** Il modificatore di colore. `""` = testo pieno, che è il quarto caso. */
  tinta: "" | "attesa" | "si" | "no";
}

export const GRUPPI: readonly Gruppo[] = ["in-arrivo", "in-attesa", "collegata", "bloccata"];

export const ASPETTO: Readonly<Record<Gruppo, AspettoGruppo>> = {
  bloccata: { icona: "shield", tinta: "no", titolo: "Bloccate" },
  collegata: { icona: "link", tinta: "si", titolo: "Collegate" },
  "in-arrivo": { icona: "bell", tinta: "", titolo: "Ti hanno chiesto di collegarti" },
  "in-attesa": { icona: "clock", tinta: "attesa", titolo: "Aspettano una risposta" },
};

export function gruppoDi(istanza: FederatedInstanceView): Gruppo {
  switch (istanza.state) {
    case "richiesta_ricevuta":
      return "in-arrivo";
    case "richiesta_inviata":
      return "in-attesa";
    case "collegata":
      return "collegata";
    case "bloccata":
      return "bloccata";
  }
}

/** Che cosa si può fare a una casa, e quale di queste è la cosa che ci si aspetta. */
export type Azione =
  "accetta" | "rifiuta" | "rimanda" | "verifica" | "copia" | "blocca" | "dimentica";

/**
 * L'azione che sta **fuori** dal menu, visibile sulla riga.
 *
 * Una sola, e non su tutti i gruppi: una richiesta in arrivo esiste per essere
 * accettata, e seppellirla dentro un menu significherebbe che chi apre la
 * pagina non vede che c'è una decisione da prendere. `DESIGN_SYSTEM.md`
 * §«Euristiche» n. 6 chiede il contrario, e la n. 3 chiede che la via d'uscita
 * — «Rifiuta» — stia accanto ad «Accetta»: per questo sono due.
 */
export function principaliDi(gruppo: Gruppo): readonly Azione[] {
  return gruppo === "in-arrivo" ? ["accetta", "rifiuta"] : [];
}

/** Tutto il resto, dietro il burger. */
export function secondarieDi(gruppo: Gruppo): readonly Azione[] {
  switch (gruppo) {
    case "in-arrivo":
      return ["copia", "blocca"];
    case "in-attesa":
      return ["rimanda", "verifica", "copia", "dimentica"];
    case "collegata":
      return ["verifica", "copia", "blocca", "dimentica"];
    case "bloccata":
      return ["copia", "dimentica"];
  }
}

/**
 * Le azioni che chiedono conferma prima di partire.
 *
 * `dimentica` è qui anche quando sembra innocua: **toglie la casa
 * dall'elenco**, che è ciò che il codice dell'istanza fa davvero
 * (`remotes.remove`), e su una casa collegata taglia un legame costruito in
 * due.
 */
export function chiedeConferma(azione: Azione): boolean {
  return azione === "blocca" || azione === "dimentica";
}
