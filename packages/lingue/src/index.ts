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

/**
 * A phrase that depends on a count: `base.one`, `base.other`, and whatever
 * forms a language needs (`few`, `many`…), chosen by `Intl.PluralRules`.
 * English always has `base.other`, so that is what makes a base.
 */
export type BasePlurale = {
  [K in Chiave]: K extends `${infer Base}.other` ? Base : never;
}[Chiave];

export const FORME_PLURALI: readonly Intl.LDMLPluralRule[] = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
];

export type Catalogo = Partial<Record<Chiave, string>>;

export type Valori = Readonly<Record<string, string | number>>;

export const LINGUA_DI_RIFERIMENTO = "en";

// A new language is a new file in `frasi/` plus one line here. The test in
// `cataloghi.test.ts` fails if a file is added and this line is forgotten.
const CATALOGHI: Readonly<Record<string, Catalogo>> = { en, it };

const RIFERIMENTO: Record<Chiave, string> = en;

// A translation may have plural forms English does not, such as Polish `few`:
// the table is read through plain strings for those.
function cerca(codice: string, chiave: string): string | undefined {
  const frasi = catalogo(codice) as Readonly<Record<string, string>> | undefined;
  return frasi !== undefined && Object.hasOwn(frasi, chiave) ? frasi[chiave] : undefined;
}

function riempi(lingua: string, frase: string, valori: Valori): string {
  const numeri = new Intl.NumberFormat(esisteLingua(lingua) ? lingua : LINGUA_DI_RIFERIMENTO);

  return frase.replace(/\{(\w+)\}/g, (segnaposto, nome: string) => {
    const valore = valori[nome];
    if (valore === undefined) {
      return segnaposto;
    }
    return typeof valore === "number" ? numeri.format(valore) : valore;
  });
}

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
  return riempi(lingua, cerca(lingua, chiave) ?? RIFERIMENTO[chiave], valori);
}

/**
 * The form of `base` that fits `n` in `lingua`, with `{n}` filled in. A form
 * the language lacks is read as its `other`, then as the English one.
 */
export function traduciPlurale(
  lingua: string,
  base: BasePlurale,
  n: number,
  valori: Valori = {},
): string {
  const codice = esisteLingua(lingua) ? lingua : LINGUA_DI_RIFERIMENTO;
  const forma = new Intl.PluralRules(codice).select(n);
  const inglese = new Intl.PluralRules(LINGUA_DI_RIFERIMENTO).select(n);
  const frase =
    cerca(codice, `${base}.${forma}`) ??
    cerca(codice, `${base}.other`) ??
    cerca(LINGUA_DI_RIFERIMENTO, `${base}.${inglese}`) ??
    RIFERIMENTO[`${base}.other` as Chiave];

  return riempi(codice, frase, { n, ...valori });
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
