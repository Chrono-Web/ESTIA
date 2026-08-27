import type { IconName } from "../../ui/index.js";
import { Chat } from "./Chat.js";
import { Dispositivi } from "./Dispositivi.js";
import { Aspetto } from "./Aspetto.js";
import { Informazioni } from "./Informazioni.js";
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
export type Chiave =
  | "aspetto"
  | "presenza"
  | "chat"
  | "dispositivi"
  | "informazioni"
  | "inviti"
  | "estianet"
  | "backup"
  | "stato"
  | "registro";

export interface Voce {
  chiave: Chiave;
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
    titolo: "Tu",
    voci: [
      {
        chiave: "aspetto",
        componente: Aspetto,
        icona: "settings",
        nota: "Chiaro, scuro, contrasto e palette — solo per te",
        titolo: "Aspetto",
        to: "/impostazioni/aspetto",
      },
      {
        chiave: "presenza",
        componente: Presenza,
        icona: "globe",
        nota: "Fin dove arrivi, e chi può seguirti",
        titolo: "Chi ti trova, chi ti segue",
        to: "/impostazioni/presenza",
      },
      {
        chiave: "chat",
        componente: Chat,
        icona: "key",
        nota: "Le chiavi dei messaggi privati, e la copia che le riporta altrove",
        titolo: "Chat",
        to: "/impostazioni/chat",
      },
      {
        chiave: "dispositivi",
        componente: Dispositivi,
        icona: "shield",
        nota: "Da dove sei entrato, e come si esce",
        titolo: "Accesso e dispositivi",
        to: "/impostazioni/dispositivi",
      },
    ],
  },
  {
    titolo: "Questa istanza",
    voci: [
      {
        chiave: "informazioni",
        componente: Informazioni,
        icona: "link",
        nota: "Questa casa, licenza, che cos'è ESTIA",
        titolo: "Informazioni",
        to: "/impostazioni/informazioni",
      },
    ],
  },
  {
    titolo: "Amministrazione",
    voci: [
      {
        chiave: "inviti",
        componente: Inviti,
        icona: "key",
        nota: "Gli inviti da mandare, e chi entra usandoli",
        soloAdmin: true,
        titolo: "Inviti",
        to: "/impostazioni/amministrazione/inviti",
      },
      {
        chiave: "estianet",
        componente: EstiaNet,
        icona: "globe",
        nota: "Accendere, condividere la chiave, collegare altre istanze",
        soloAdmin: true,
        titolo: "EstiaNet",
        to: "/impostazioni/amministrazione/estianet",
      },
      {
        chiave: "backup",
        componente: Backup,
        icona: "download",
        nota: "Archivi cifrati, e da dove si torna indietro",
        soloAdmin: true,
        titolo: "Backup",
        to: "/impostazioni/amministrazione/backup",
      },
      {
        chiave: "stato",
        componente: Stato,
        icona: "alert",
        nota: "Dove stanno i dati, cifratura, aggiornamenti",
        soloAdmin: true,
        titolo: "Stato dell'istanza",
        to: "/impostazioni/amministrazione/stato",
      },
      {
        chiave: "registro",
        componente: Registro,
        icona: "instance",
        nota: "Che cosa è stato deciso, e da chi",
        soloAdmin: true,
        titolo: "Registro",
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
