import type { IconName } from "../../ui/index.js";

/**
 * Le sezioni delle impostazioni, dichiarate una volta sola.
 *
 * L'elenco della nav, il filtro che lo cerca e le rotte escono tutti da qui:
 * aggiungere una sezione è aggiungere una riga, e non ci sono tre posti da
 * tenere allineati.
 *
 * `chiave` non è solo un identificatore: è il nome con cui una sezione può
 * accendere il proprio segnale di allarme dalla nav, senza che la nav sappia
 * niente di quello che quella sezione contiene.
 */
export type Chiave =
  | "presenza"
  | "dispositivi"
  | "informazioni"
  | "persone"
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
        chiave: "presenza",
        icona: "globe",
        nota: "Fin dove arrivi, e chi può seguirti",
        titolo: "Chi ti trova, chi ti segue",
        to: "/impostazioni/presenza",
      },
      {
        chiave: "dispositivi",
        icona: "shield",
        nota: "Ogni accesso è un dispositivo, e si revoca da qui",
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
        chiave: "persone",
        icona: "users",
        nota: "Chi ha chiesto di entrare",
        soloAdmin: true,
        titolo: "Chi entra",
        to: "/impostazioni/amministrazione/persone",
      },
      {
        chiave: "inviti",
        icona: "key",
        nota: "Creare e ritirare gli inviti",
        soloAdmin: true,
        titolo: "Inviti",
        to: "/impostazioni/amministrazione/inviti",
      },
      {
        chiave: "estianet",
        icona: "globe",
        nota: "Accendere, condividere la chiave, collegare altre istanze",
        soloAdmin: true,
        titolo: "EstiaNet",
        to: "/impostazioni/amministrazione/estianet",
      },
      {
        chiave: "backup",
        icona: "download",
        nota: "Archivi cifrati, e da dove si torna indietro",
        soloAdmin: true,
        titolo: "Backup",
        to: "/impostazioni/amministrazione/backup",
      },
      {
        chiave: "stato",
        icona: "alert",
        nota: "Dove stanno i dati, cifratura, aggiornamenti",
        soloAdmin: true,
        titolo: "Stato dell'istanza",
        to: "/impostazioni/amministrazione/stato",
      },
      {
        chiave: "registro",
        icona: "instance",
        nota: "Che cosa è stato deciso, e da chi",
        soloAdmin: true,
        titolo: "Registro",
        to: "/impostazioni/amministrazione/registro",
      },
    ],
  },
];

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
