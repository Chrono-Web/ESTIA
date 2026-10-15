import en from "./frasi/en.json" with { type: "json" };
import it from "./frasi/it.json" with { type: "json" };

/**
 * The phrase table of ESTIA (ADR 0046): one hand-written file per language,
 * shared by every client.
 *
 * English is the reference. It is always complete, so its keys are the type:
 * a key that English does not have does not compile. Every other language may
 * be partial, and what it lacks is read in English, never shown as a key.
 */
export type Chiave = keyof typeof en;

/** The codes the instance can send, each with its phrase (ADR 0046 §3). */
export type CodiceErrore = {
  [K in Chiave]: K extends `errori.${infer Codice}` ? Codice : never;
}[Chiave];

export type Catalogo = Partial<Record<Chiave, string>>;

export type Valori = Readonly<Record<string, string | number>>;

export const LINGUA_DI_RIFERIMENTO = "en";

// A new language is a new file in `frasi/` plus one line here. The test in
// `cataloghi.test.ts` fails if a file is added and this line is forgotten.
const CATALOGHI: Readonly<Record<string, Catalogo>> = { en, it };

const RIFERIMENTO: Record<Chiave, string> = en;

/** The languages the table contains, each named in its own language. */
export function lingue(): readonly { codice: string; nome: string }[] {
  return Object.keys(CATALOGHI).map((codice) => ({
    codice,
    nome: CATALOGHI[codice]?.["lingua.nome"] ?? codice,
  }));
}

export function esisteLingua(codice: string): boolean {
  return Object.hasOwn(CATALOGHI, codice);
}

/** The raw file of one language, for the checks on the table itself. */
export function catalogo(codice: string): Catalogo | undefined {
  return Object.hasOwn(CATALOGHI, codice) ? CATALOGHI[codice] : undefined;
}

/**
 * The phrase for `chiave` in `lingua`, with `{name}` placeholders filled from
 * `valori`. Numbers are formatted the way that language writes them.
 */
export function traduci(lingua: string, chiave: Chiave, valori: Valori = {}): string {
  const frase = catalogo(lingua)?.[chiave] ?? RIFERIMENTO[chiave];
  const numeri = new Intl.NumberFormat(esisteLingua(lingua) ? lingua : LINGUA_DI_RIFERIMENTO);

  return frase.replace(/\{(\w+)\}/g, (segnaposto, nome: string) => {
    const valore = valori[nome];
    if (valore === undefined) {
      return segnaposto;
    }
    return typeof valore === "number" ? numeri.format(valore) : valore;
  });
}

/**
 * What a person reads when the instance refuses a request (ADR 0046 §3): the
 * phrase of `errori.<code>` in their language. A code the table does not know
 * falls back to the instance's `message`, so a raw code is never the outcome.
 */
export function fraseDiErrore(
  lingua: string,
  errore: { code: string; message: string; params?: Valori },
): string {
  const chiave = `errori.${errore.code}`;
  if (!Object.hasOwn(RIFERIMENTO, chiave)) {
    return errore.message;
  }
  return traduci(lingua, chiave as Chiave, errore.params);
}
