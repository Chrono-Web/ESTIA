/**
 * Come si chiamano le sezioni delle impostazioni, in un posto solo.
 *
 * Sta qui e non in `registro.ts` per una ragione meccanica: `registro.ts`
 * importa le dieci schermate, ogni schermata importa `Sezione`, e se `Sezione`
 * andasse a leggere il registro si chiuderebbe un cerchio — registro →
 * EstiaNet → Sezione → registro. ESM lo regge, il bundler lo segnala, e
 * l'ordine di valutazione diventa una cosa da sperare. Questo file non importa
 * niente, quindi non può chiudere nessun cerchio.
 *
 * Il titolo di una sezione era scritto **due volte**: qui e nella schermata,
 * dentro `<Sezione titolo="…">`. Cinque schermate lo scrivevano perfino tre
 * volte, perché duplicavano l'intera cornice per dire «Carico…». Il giorno che
 * cambia, ne cambia una sola.
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

/** Il nome di ogni sezione: lo legge la nav, la ricerca e la pagina stessa. */
export const TITOLI: Readonly<Record<Chiave, string>> = {
  aspetto: "Aspetto",
  backup: "Backup",
  chat: "Chat",
  dispositivi: "Accesso e dispositivi",
  estianet: "EstiaNet",
  informazioni: "Informazioni",
  inviti: "Inviti",
  presenza: "Chi ti trova, chi ti segue",
  registro: "Registro",
  stato: "Stato dell'istanza",
};
