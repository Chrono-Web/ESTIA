/**
 * Come si chiamano le sezioni delle impostazioni, in un posto solo.
 *
 * Sta qui e non in `registro.ts` per una ragione meccanica: `registro.ts`
 * importa le dieci schermate, ogni schermata importa `Sezione`, e se `Sezione`
 * andasse a leggere il registro si chiuderebbe un cerchio — registro →
 * EstiaNet → Sezione → registro. ESM lo regge, il bundler lo segnala, e
 * l'ordine di valutazione diventa una cosa da sperare. Questo file importa solo
 * le traduzioni, quindi non può chiudere nessun cerchio.
 *
 * Il titolo di una sezione era scritto **due volte**: qui e nella schermata,
 * dentro `<Sezione titolo="…">`. Cinque schermate lo scrivevano perfino tre
 * volte, perché duplicavano l'intera cornice per dire «Carico…». Il giorno che
 * cambia, ne cambia una sola.
 */

import type { PlainMessageKey } from "@estia/i18n";

import { t } from "../../i18n/index.js";

export type Chiave =
  | "aspetto"
  | "lingua"
  | "presenza"
  | "chat"
  | "dispositivi"
  | "informazioni"
  | "inviti"
  | "estianet"
  | "backup"
  | "stato"
  | "registro";

/** Le chiavi del catalogo `sections` per ogni sezione (ADR 0044). */
const TESTI: Readonly<Record<Chiave, { titolo: PlainMessageKey; nota: PlainMessageKey }>> = {
  aspetto: { nota: "sections.appearance.note", titolo: "sections.appearance.title" },
  backup: { nota: "sections.backup.note", titolo: "sections.backup.title" },
  chat: { nota: "sections.chat.note", titolo: "sections.chat.title" },
  dispositivi: { nota: "sections.devices.note", titolo: "sections.devices.title" },
  estianet: { nota: "sections.estianet.note", titolo: "sections.estianet.title" },
  informazioni: { nota: "sections.info.note", titolo: "sections.info.title" },
  inviti: { nota: "sections.invites.note", titolo: "sections.invites.title" },
  lingua: { nota: "sections.language.note", titolo: "sections.language.title" },
  presenza: { nota: "sections.presence.note", titolo: "sections.presence.title" },
  registro: { nota: "sections.log.note", titolo: "sections.log.title" },
  stato: { nota: "sections.status.note", titolo: "sections.status.title" },
};

/**
 * Il nome di ogni sezione: lo legge la nav, la ricerca e la pagina stessa.
 *
 * Una funzione e non una costante: il nome si scrive nella lingua di chi
 * guarda **adesso**, e un oggetto calcolato al caricamento del modulo
 * resterebbe nella lingua di allora.
 */
export function titoloSezione(chiave: Chiave): string {
  return t(TESTI[chiave].titolo);
}

/** Che cosa si trova in una sezione, per l'elenco e per la ricerca. */
export function notaSezione(chiave: Chiave): string {
  return t(TESTI[chiave].nota);
}
