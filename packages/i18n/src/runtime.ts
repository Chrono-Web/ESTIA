/**
 * The whole translation runtime of ESTIA (ADR 0044 §2).
 *
 * It does four things and nothing else: find a key along a chain of languages,
 * pick the plural form with `Intl.PluralRules`, replace `{{placeholders}}`, and
 * split rich text into segments the caller turns into elements. No library,
 * because those four things fit in this file and a library would bring an API
 * ten times wider than what ESTIA uses.
 *
 * It is shared by the web client, the server and the generator, so it touches
 * nothing that exists in only one of those places: no DOM, no `fs`.
 */

/** One language's messages, flat, keyed `namespace.key` (`feed.compose.placeholder`). */
export type Messages = Readonly<Record<string, string>>;

/** A value a placeholder can take. Numbers other than `count` are written as they are. */
export type ParamValue = string | number;

export type Params = Readonly<Record<string, ParamValue>>;

/** The categories `Intl.PluralRules` can answer, which are also the key suffixes. */
export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** The language every key exists in, and against which completeness is measured. */
export const SOURCE_LANGUAGE = "it";

/**
 * The bridge language (ADR 0044 §1): complete by rule, and the first place a
 * missing sentence falls back to — whoever reads German is likelier to read
 * English than Italian.
 */
export const BRIDGE_LANGUAGE = "en";

const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

const PLURAL_SUFFIX = new RegExp(`_(${PLURAL_CATEGORIES.join("|")})$`);

/**
 * The key a plural variant belongs to: `feed.posts_one` → `feed.posts`.
 *
 * A key that merely ends in `_one` without being part of a plural group would
 * be misread here; the catalogue tests refuse such keys.
 */
export function baseKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, "");
}

/** The plural category a key carries, if any. */
export function pluralCategoryOf(key: string): PluralCategory | undefined {
  const match = PLURAL_SUFFIX.exec(key);

  return match === null ? undefined : (match[1] as PluralCategory);
}

/** The placeholder names a message uses, in order of first appearance. */
export function placeholdersOf(message: string): string[] {
  const names: string[] = [];

  for (const match of message.matchAll(PLACEHOLDER)) {
    const name = match[1]!;

    if (!names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

/**
 * The order in which languages are tried for `language`: itself, then the
 * bridge, then the source. Duplicates are dropped, so Italian is just Italian.
 */
export function fallbackChain(language: string): string[] {
  const chain: string[] = [];

  for (const candidate of [language, BRIDGE_LANGUAGE, SOURCE_LANGUAGE]) {
    if (!chain.includes(candidate)) {
      chain.push(candidate);
    }
  }

  return chain;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRules(language: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(language);

  if (rules === undefined) {
    rules = new Intl.PluralRules(language);
    pluralRulesCache.set(language, rules);
  }

  return rules;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function formatCount(language: string, value: number): string {
  let format = numberFormatCache.get(language);

  if (format === undefined) {
    format = new Intl.NumberFormat(language);
    numberFormatCache.set(language, format);
  }

  return format.format(value);
}

/**
 * Replaces `{{name}}` with its value.
 *
 * Only `count` is formatted as a number of the language — «1.234» in Italian,
 * «1,234» in English. Any other number is written as it is, because a year or
 * a port formatted as a quantity («2.026», «3.000») is a bug, and the caller is
 * the one who knows which is which. A placeholder without a value stays
 * visible: a sentence with `{{name}}` in it is a bug somebody will report, an
 * empty gap is one nobody sees.
 */
export function interpolate(language: string, message: string, params: Params = {}): string {
  return message.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];

    if (value === undefined) {
      return whole;
    }

    if (name === "count" && typeof value === "number") {
      return formatCount(language, value);
    }

    return String(value);
  });
}

/** A piece of rich text: plain text, or text wrapped in a named tag. */
export type RichSegment = string | { tag: string; text: string };

const TAG = /<([a-z][a-z0-9]*)>([\s\S]*?)<\/\1>|<([a-z][a-z0-9]*)\s*\/>/g;

/**
 * Splits `Press <b>Save</b> when done` into segments.
 *
 * Tags are names, never HTML: the caller decides what `b` becomes, so a
 * catalogue cannot inject markup. Tags do not nest — no sentence in ESTIA
 * needs it, and a translator should never have to balance them. A self-closing
 * tag (`<br/>`) comes back with empty text.
 */
export function splitRich(message: string): RichSegment[] {
  const segments: RichSegment[] = [];
  let last = 0;

  for (const match of message.matchAll(TAG)) {
    const index = match.index;

    if (index > last) {
      segments.push(message.slice(last, index));
    }

    segments.push({ tag: match[1] ?? match[3]!, text: match[2] ?? "" });
    last = index + match[0].length;
  }

  if (last < message.length) {
    segments.push(message.slice(last));
  }

  return segments;
}

export interface TranslatorOptions {
  /** The language the person reads. */
  language: string;
  /** Messages by language. Languages not loaded are simply skipped in the chain. */
  catalogs: Readonly<Record<string, Messages | undefined>>;
  /** Called once per key that no language in the chain has. */
  onMissing?: (key: string, language: string) => void;
}

export interface Translator {
  readonly language: string;
  /** The sentence for `key`, with placeholders filled. The key itself if nothing has it. */
  t(key: string, params?: Params): string;
  /** Whether some language in the chain has `key` (or one of its plural forms). */
  has(key: string): boolean;
  /** The same as `t`, split into rich segments. */
  rich(key: string, params?: Params): RichSegment[];
}

/**
 * Finds the raw message for `key` along the chain, and the language it came
 * from — the plural form must be chosen with the rules of the language that
 * actually answers, not the one that asked.
 */
function lookup(
  chain: readonly string[],
  catalogs: TranslatorOptions["catalogs"],
  key: string,
  count: number | undefined,
): { language: string; message: string } | undefined {
  for (const language of chain) {
    const messages = catalogs[language];

    if (messages === undefined) {
      continue;
    }

    if (count !== undefined) {
      const category = pluralRules(language).select(count);
      const exact = messages[`${key}_${category}`] ?? messages[`${key}_other`];

      if (exact !== undefined) {
        return { language, message: exact };
      }
    }

    const plain = messages[key];

    if (plain !== undefined) {
      return { language, message: plain };
    }

    // A plural key asked for without a count still has an answer: the general
    // form. Better than showing the key.
    const other = messages[`${key}_other`];

    if (other !== undefined) {
      return { language, message: other };
    }
  }

  return undefined;
}

export function createTranslator(options: TranslatorOptions): Translator {
  const chain = fallbackChain(options.language);
  const reported = new Set<string>();

  const resolve = (key: string, params: Params | undefined): string => {
    const count = typeof params?.count === "number" ? params.count : undefined;
    const found = lookup(chain, options.catalogs, key, count);

    if (found === undefined) {
      if (!reported.has(key)) {
        reported.add(key);
        options.onMissing?.(key, options.language);
      }

      return key;
    }

    return interpolate(found.language, found.message, params);
  };

  return {
    language: options.language,
    t: resolve,
    has: (key) => lookup(chain, options.catalogs, key, undefined) !== undefined,
    rich: (key, params) => splitRich(resolve(key, params)),
  };
}

/**
 * Picks the language to use from what is available and what is asked for, in
 * order of preference (ADR 0044 §3).
 *
 * Each wish is tried whole first and then by its primary subtag, so a browser
 * that says `en-GB` gets `en`, and `pt-BR` would get `pt-BR` before `pt`.
 * Wishes that are `undefined` or empty are skipped, which lets the caller pass
 * «the person's choice, if any» without branching.
 */
export function negotiateLanguage(
  available: readonly string[],
  wishes: readonly (string | undefined | null)[],
  last: string = BRIDGE_LANGUAGE,
): string {
  const lower = new Map(available.map((code) => [code.toLowerCase(), code]));

  for (const wish of wishes) {
    if (wish === undefined || wish === null || wish.trim() === "") {
      continue;
    }

    const normalized = wish.trim().replace("_", "-").toLowerCase();
    const whole = lower.get(normalized);

    if (whole !== undefined) {
      return whole;
    }

    const primary = lower.get(normalized.split("-")[0]!);

    if (primary !== undefined) {
      return primary;
    }
  }

  return lower.get(last.toLowerCase()) ?? available[0] ?? last;
}

/**
 * The language a POSIX locale names: `en_US.UTF-8` → `en`, `it_IT@euro` → `it`.
 * `C` and `POSIX` name no language at all.
 */
export function languageOfLocale(locale: string | undefined): string | undefined {
  if (locale === undefined) {
    return undefined;
  }

  const code = locale.split(/[.@]/)[0]!.trim();

  if (code === "" || code === "C" || code === "POSIX") {
    return undefined;
  }

  return code.replace("_", "-");
}
