import { t } from "../../i18n/index.js";
import type { IconName } from "../../ui/index.js";

import { notaSezione, titoloSezione, type Chiave } from "./sezioni.js";
import { Chat } from "./Chat.js";
import { Dispositivi } from "./Dispositivi.js";
import { Aspetto } from "./Aspetto.js";
import { Informazioni } from "./Informazioni.js";
import { Lingua } from "./Lingua.js";
import { Presenza } from "./Presenza.js";
import { Backup } from "./amministrazione/Backup.js";
import { EstiaNet } from "./amministrazione/EstiaNet.js";
import { Inviti } from "./amministrazione/Inviti.js";
import { Registro } from "./amministrazione/Registro.js";
import { Stato } from "./amministrazione/Stato.js";

/**
 * Le sezioni delle impostazioni, dichiarate una volta sola.
 *
 * L'elenco della nav, il filtro che lo cerca e **le rotte** escono tutti da
 * qui: aggiungere una sezione è aggiungere una riga, e non ci sono tre posti
 * da tenere allineati. `App.tsx` le monta scorrendo questo elenco, e da
 * `soloAdmin` decide da solo che cosa proteggere — così una sezione non può
 * dichiararsi di amministrazione nella nav ed essere aperta nella rotta.
 *
 * `chiave` non è solo un identificatore: è il nome con cui una sezione può
 * accendere il proprio segnale di allarme dalla nav, senza che la nav sappia
 * niente di quello che quella sezione contiene.
 */
export type { Chiave };

export interface Voce {
  chiave: Chiave;
  /** Da `sezioni.ts`: il nome di una sezione si scrive in un posto solo. */
  titolo: string;
  /** Che cosa ci si trova. Serve all'elenco e alla ricerca. */
  nota: string;
  icona: IconName;
  to: string;
  /** Le sezioni di chi amministra l'istanza. */
  soloAdmin?: boolean;
  /** Che cosa si vede aprendola. È da qui che nasce la rotta. */
  componente: React.ComponentType;
}

export interface Gruppo {
  titolo: string;
  voci: readonly Voce[];
}

export const GRUPPI: readonly Gruppo[] = [
  {
    get titolo() {
      return t("sections.group.you");
    },
    voci: [
      {
        chiave: "aspetto",
        componente: Aspetto,
        icona: "settings",
        get nota() {
          return notaSezione("aspetto");
        },
        get titolo() {
          return titoloSezione("aspetto");
        },
        to: "/impostazioni/aspetto",
      },
      {
        chiave: "lingua",
        componente: Lingua,
        icona: "globe",
        get nota() {
          return notaSezione("lingua");
        },
        get titolo() {
          return titoloSezione("lingua");
        },
        to: "/impostazioni/lingua",
      },
      {
        chiave: "presenza",
        componente: Presenza,
        icona: "globe",
        get nota() {
          return notaSezione("presenza");
        },
        get titolo() {
          return titoloSezione("presenza");
        },
        to: "/impostazioni/presenza",
      },
      {
        chiave: "chat",
        componente: Chat,
        icona: "key",
        get nota() {
          return notaSezione("chat");
        },
        get titolo() {
          return titoloSezione("chat");
        },
        to: "/impostazioni/chat",
      },
      {
        chiave: "dispositivi",
        componente: Dispositivi,
        icona: "shield",
        get nota() {
          return notaSezione("dispositivi");
        },
        get titolo() {
          return titoloSezione("dispositivi");
        },
        to: "/impostazioni/dispositivi",
      },
    ],
  },
  {
    get titolo() {
      return t("sections.group.instance");
    },
    voci: [
      {
        chiave: "informazioni",
        componente: Informazioni,
        icona: "link",
        get nota() {
          return notaSezione("informazioni");
        },
        get titolo() {
          return titoloSezione("informazioni");
        },
        to: "/impostazioni/informazioni",
      },
    ],
  },
  {
    get titolo() {
      return t("sections.group.admin");
    },
    voci: [
      {
        chiave: "inviti",
        componente: Inviti,
        icona: "key",
        get nota() {
          return notaSezione("inviti");
        },
        soloAdmin: true,
        get titolo() {
          return titoloSezione("inviti");
        },
        to: "/impostazioni/amministrazione/inviti",
      },
      {
        chiave: "estianet",
        componente: EstiaNet,
        icona: "globe",
        get nota() {
          return notaSezione("estianet");
        },
        soloAdmin: true,
        get titolo() {
          return titoloSezione("estianet");
        },
        to: "/impostazioni/amministrazione/estianet",
      },
      {
        chiave: "backup",
        componente: Backup,
        icona: "download",
        get nota() {
          return notaSezione("backup");
        },
        soloAdmin: true,
        get titolo() {
          return titoloSezione("backup");
        },
        to: "/impostazioni/amministrazione/backup",
      },
      {
        chiave: "stato",
        componente: Stato,
        icona: "alert",
        get nota() {
          return notaSezione("stato");
        },
        soloAdmin: true,
        get titolo() {
          return titoloSezione("stato");
        },
        to: "/impostazioni/amministrazione/stato",
      },
      {
        chiave: "registro",
        componente: Registro,
        icona: "instance",
        get nota() {
          return notaSezione("registro");
        },
        soloAdmin: true,
        get titolo() {
          return titoloSezione("registro");
        },
        to: "/impostazioni/amministrazione/registro",
      },
    ],
  },
];

/** Ogni voce in fila, senza i gruppi: è la forma che serve alle rotte. */
export const VOCI: readonly Voce[] = GRUPPI.flatMap((gruppo) => gruppo.voci);

/**
 * L'indirizzo di una sezione, relativo alla rotta `impostazioni`.
 *
 * `to` resta assoluto perché è quello che serve ai link; qui si toglie il
 * prefisso, che è l'unica cosa che React Router non vuole.
 */
export function rottaDi(voce: Voce): string {
  return voce.to.slice("/impostazioni/".length);
}

/** Filtra per testo, su titolo e nota: una sezione si cerca come la si nomina. */
export function filtra(gruppi: readonly Gruppo[], termine: string): readonly Gruppo[] {
  const cercato = termine.trim().toLowerCase();

  if (cercato === "") {
    return gruppi;
  }

  return gruppi
    .map((gruppo) => ({
      ...gruppo,
      voci: gruppo.voci.filter((voce) =>
        `${voce.titolo} ${voce.nota}`.toLowerCase().includes(cercato),
      ),
    }))
    .filter((gruppo) => gruppo.voci.length > 0);
}
