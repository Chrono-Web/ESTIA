/**
 * The web client's translations (ADR 0044).
 *
 * Every sentence the interface shows comes from here: `t("feed.compose.placeholder")`
 * for plain text, `<T k="…" tags={…} />` when a sentence has bold words or a
 * link in it. The sentences themselves live in `packages/i18n/locales/<language>/`.
 *
 * Italian, the source language, is bundled with the page, so the first render
 * never waits and the tests need no set-up. Every other language is a separate
 * file loaded when someone chooses it.
 *
 * Changing language remounts the tree under `<LinguaRoot>`: every component
 * re-renders with the new sentences, including the ones that call `t()` outside
 * React. It loses local state — a half-typed field — which is an acceptable
 * price for something done once, from the settings.
 */
import {
  BRIDGE_LANGUAGE,
  createTranslator,
  LANGUAGES,
  type LanguageInfo,
  type MessageArgs,
  type MessageKey,
  type Messages,
  negotiateLanguage,
  type Params,
  SOURCE_LANGUAGE,
  splitRich,
  type Translator,
} from "@estia/i18n";
import { Fragment, type ReactNode, useSyncExternalStore } from "react";

type NamespaceFile = Readonly<Record<string, string>>;

// The shell scripts' and the server's sentences are not the browser's business.
const SOURCE_FILES = import.meta.glob<NamespaceFile>(
  [
    "../../../../packages/i18n/locales/it/*.json",
    "!**/installer.json",
    "!**/cli.json",
    "!**/server.json",
  ],
  { eager: true, import: "default" },
);

const OTHER_FILES = import.meta.glob<NamespaceFile>(
  [
    "../../../../packages/i18n/locales/*/*.json",
    "!../../../../packages/i18n/locales/it/*.json",
    "!**/installer.json",
    "!**/cli.json",
    "!**/server.json",
  ],
  { import: "default" },
);

const FILE = /locales\/([^/]+)\/([^/]+)\.json$/;

function flatten(entries: Iterable<readonly [string, NamespaceFile]>): Messages {
  const flat: Record<string, string> = {};

  for (const [path, file] of entries) {
    const namespace = FILE.exec(path)?.[2];

    if (namespace === undefined) {
      continue;
    }

    for (const [key, value] of Object.entries(file)) {
      flat[`${namespace}.${key}`] = value;
    }
  }

  return flat;
}

const loaded: Record<string, Messages> = {
  [SOURCE_LANGUAGE]: flatten(Object.entries(SOURCE_FILES)),
};

async function load(language: string): Promise<void> {
  if (loaded[language] !== undefined) {
    return;
  }

  const files = await Promise.all(
    Object.entries(OTHER_FILES)
      .filter(([path]) => FILE.exec(path)?.[1] === language)
      .map(async ([path, read]) => [path, await read()] as const),
  );

  loaded[language] = flatten(files);
}

function translatorFor(language: string): Translator {
  return createTranslator({
    catalogs: loaded,
    language,
    onMissing: (key, asked) => {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] no language has "${key}" (asked for ${asked})`);
      }
    },
  });
}

let current = translatorFor(SOURCE_LANGUAGE);
const listeners = new Set<() => void>();

/** Every language ESTIA has, with its name and how complete it is. */
export const LINGUE: readonly LanguageInfo[] = LANGUAGES;

/** The code of the language in use. */
export function lingua(): string {
  return current.language;
}

/** The sentence for `key`. Its placeholders are checked by the compiler. */
export function t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
  return current.t(key, args[0]);
}

/**
 * The same for a key built at runtime — `errors.${code}` — which the compiler
 * cannot check. Ask `haChiave` first when a missing key has a better answer.
 */
export function tChiave(key: string, params?: Params): string {
  return current.t(key, params);
}

/** Whether some language in the chain has `key`. */
export function haChiave(key: string): boolean {
  return current.has(key);
}

/** The language's own sentence announcing it is incomplete, or `undefined` at 100%. */
export function avvisoIncompleta(code: string): string | undefined {
  const info = LINGUE.find((language) => language.code === code);

  if (info === undefined || info.percent >= 100) {
    return undefined;
  }

  return info.incomplete.replaceAll("{{percent}}", String(info.percent));
}

/**
 * Switches language: loads its sentences (and the bridge language's, which
 * fills its gaps), then tells the page. `lang` on `<html>` follows, because a
 * screen reader picks its voice from it.
 */
export async function impostaLingua(code: string): Promise<void> {
  const language = negotiateLanguage(
    LINGUE.map((info) => info.code),
    [code],
  );

  await Promise.all([load(language), load(BRIDGE_LANGUAGE)]);

  if (language !== current.language) {
    current = translatorFor(language);

    for (const listener of listeners) {
      listener();
    }
  }

  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

/** The language in use, re-rendering when it changes. */
export function useLingua(): string {
  return useSyncExternalStore(subscribe, lingua, lingua);
}

/** Remounts everything under it when the language changes. */
export function LinguaRoot({ children }: { children: ReactNode }): React.ReactElement {
  const language = useLingua();

  return <Fragment key={language}>{children}</Fragment>;
}

/** What each tag of a rich sentence becomes. */
export type Tags = Readonly<Record<string, (text: string) => ReactNode>>;

/**
 * A sentence with tags in it: `"Premi <b>Salva</b> quando hai finito"`.
 *
 * The component decides what `b` becomes; a tag it does not know is shown as
 * its plain text, so a translation can never inject markup.
 */
export function T<K extends MessageKey>({
  k,
  params,
  tags = {},
}: {
  k: K;
  params?: Params;
  tags?: Tags;
}): React.ReactElement {
  const segments = splitRich(current.t(k, params));

  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          <Fragment key={index}>{segment}</Fragment>
        ) : (
          <Fragment key={index}>
            {tags[segment.tag]?.(segment.text) ??
              (segment.tag === "b" ? <strong>{segment.text}</strong> : segment.text)}
          </Fragment>
        ),
      )}
    </>
  );
}

// --- Which language, and remembering it ---------------------------------------

const CHIAVE_SCELTA = "estia.lingua";
const CHIAVE_ISTANZA = "estia.lingua.istanza";

function leggi(chiave: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(chiave) ?? undefined;
  } catch {
    return undefined;
  }
}

function scrivi(chiave: string, valore: string | undefined): void {
  try {
    if (valore === undefined) {
      globalThis.localStorage?.removeItem(chiave);
    } else {
      globalThis.localStorage?.setItem(chiave, valore);
    }
  } catch {
    // Storage off (private window): the choice lasts until the page closes.
  }
}

/** The language the person chose on this browser, if any. `undefined` is «automatic». */
export function leggiSceltaLocale(): string | undefined {
  return leggi(CHIAVE_SCELTA);
}

export function scriviSceltaLocale(code: string | undefined): void {
  scrivi(CHIAVE_SCELTA, code);
}

/**
 * The instance's default language, remembered so the next visit starts in it
 * instead of flashing another one while the instance answers.
 */
export function ricordaLinguaIstanza(code: string | undefined): void {
  scrivi(CHIAVE_ISTANZA, code);
}

/**
 * Which language to use (ADR 0044 §3): the person's choice, then the
 * browser's languages, then the instance's, then the bridge language.
 */
export function scegliLingua({
  scelta,
  istanza,
  browser = typeof navigator === "undefined" ? [] : navigator.languages,
}: {
  scelta?: string | null | undefined;
  istanza?: string | null | undefined;
  browser?: readonly string[];
}): string {
  return negotiateLanguage(
    LINGUE.map((info) => info.code),
    [scelta, ...browser, istanza],
  );
}

/** The language to start in, before anything has been asked of the instance. */
export function linguaIniziale(): string {
  return scegliLingua({ istanza: leggi(CHIAVE_ISTANZA), scelta: leggiSceltaLocale() });
}

// --- Formats of the language in use -------------------------------------------

/** A date or time, as the language in use writes it. */
export function formatoData(valore: Date | string, opzioni: Intl.DateTimeFormatOptions): string {
  return new Date(valore).toLocaleString(current.language, opzioni);
}

/** A number, as the language in use writes it: «1.234» or «1,234». */
export function formatoNumero(valore: number, opzioni?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(current.language, opzioni).format(valore);
}

/** A list, as the language in use joins it: «a, b e c» or «a, b, and c». */
export function formatoElenco(voci: readonly string[]): string {
  return new Intl.ListFormat(current.language, { style: "long", type: "conjunction" }).format(voci);
}
