/**
 * What the catalogues contain, whether they are sound, and how complete each
 * language is (ADR 0044 §1, §4, §6).
 *
 * Pure functions over already-parsed files: reading the disk is `node.ts`'s
 * job, writing it is the generator's. That keeps every rule here testable with
 * a catalogue built in the test itself.
 */
import {
  baseKey,
  BRIDGE_LANGUAGE,
  type Messages,
  placeholdersOf,
  pluralCategoryOf,
  SOURCE_LANGUAGE,
  splitRich,
} from "./runtime.js";

/** One language on disk: namespace (file name without `.json`) → its keys. */
export type LocaleFiles = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** Every language on disk. */
export type Catalogue = Readonly<Record<string, LocaleFiles>>;

/** The namespace that says who a language is. */
export const META_NAMESPACE = "meta";

/** The namespaces whose sentences are printed by shell scripts, not by the web client. */
export const SHELL_NAMESPACES = ["installer", "cli"] as const;

/** The namespaces printed by the server process itself (console, backup CLI). */
export const SERVER_NAMESPACES = ["server"] as const;

const NAMESPACE_NAME = /^[a-z][a-z0-9-]*$/;
const KEY_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Z]{2}|-[A-Z][a-z]{3})?$/;

/** The flat messages of one language: `namespace.key` → sentence. */
export function flatten(files: LocaleFiles): Messages {
  const flat: Record<string, string> = {};

  for (const [namespace, entries] of Object.entries(files)) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value === "string") {
        flat[`${namespace}.${key}`] = value;
      }
    }
  }

  return flat;
}

/** Keys grouped by the key they belong to, plural variants together. */
function groups(messages: Messages): Map<string, string[]> {
  const byBase = new Map<string, string[]>();

  for (const key of Object.keys(messages)) {
    const base = baseKey(key);
    const list = byBase.get(base) ?? [];
    list.push(key);
    byBase.set(base, list);
  }

  return byBase;
}

function tagsOf(message: string): string[] {
  return splitRich(message)
    .filter((segment): segment is { tag: string; text: string } => typeof segment !== "string")
    .map((segment) => segment.tag)
    .sort();
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export interface ValidationOptions {
  /** Languages that must translate every key. By rule, the source and the bridge. */
  complete?: readonly string[];
}

/**
 * Everything wrong with the catalogue, as sentences a translator can act on.
 * Empty means sound.
 */
export function validate(
  catalogue: Catalogue,
  options: ValidationOptions = { complete: [SOURCE_LANGUAGE, BRIDGE_LANGUAGE] },
): string[] {
  const problems: string[] = [];
  const source = catalogue[SOURCE_LANGUAGE];

  if (source === undefined) {
    return [`The source language "${SOURCE_LANGUAGE}" has no catalogue.`];
  }

  for (const [language, files] of Object.entries(catalogue)) {
    if (!LANGUAGE_CODE.test(language)) {
      problems.push(`"${language}" is not a language code (use "de", "pt-BR", "zh-Hant").`);
    }

    for (const [namespace, entries] of Object.entries(files)) {
      const where = `${language}/${namespace}.json`;

      if (!NAMESPACE_NAME.test(namespace)) {
        problems.push(`${where}: file names are lowercase letters, digits and hyphens.`);
      }

      if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
        problems.push(`${where}: must be a JSON object of "key": "sentence".`);
        continue;
      }

      for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== "string") {
          problems.push(`${where}: "${key}" must be a string (no nesting, no arrays).`);
        }

        if (!KEY_NAME.test(key)) {
          problems.push(`${where}: "${key}" is not a valid key.`);
        }
      }
    }

    const meta = files[META_NAMESPACE];

    if (meta === undefined || typeof meta.name !== "string" || meta.name.trim() === "") {
      problems.push(
        `${language}/${META_NAMESPACE}.json: "name" is required — the language's own name.`,
      );
    }
  }

  const sourceMessages = flatten(source);
  const sourceGroups = groups(sourceMessages);

  for (const [base, keys] of sourceGroups) {
    const plural = keys.some((key) => pluralCategoryOf(key) !== undefined);

    if (plural && !keys.includes(`${base}_other`)) {
      problems.push(`${SOURCE_LANGUAGE}: "${base}" has plural forms but no "${base}_other".`);
    }

    if (plural && keys.includes(base)) {
      problems.push(`${SOURCE_LANGUAGE}: "${base}" is both a plain key and a plural group.`);
    }

    const namespace = base.split(".")[0]!;

    if (plural && (SHELL_NAMESPACES as readonly string[]).includes(namespace)) {
      problems.push(
        `${SOURCE_LANGUAGE}/${namespace}.json: "${base}" — shell scripts cannot choose plural forms; write the sentence without one.`,
      );
    }
  }

  const sourcePlaceholders = new Map<string, Set<string>>();
  const sourceTags = new Map<string, string[]>();

  for (const [base, keys] of sourceGroups) {
    const names = new Set<string>();

    for (const key of keys) {
      for (const name of placeholdersOf(sourceMessages[key]!)) {
        names.add(name);
      }
    }

    sourcePlaceholders.set(base, names);
    sourceTags.set(base, tagsOf(sourceMessages[keys[0]!]!));
  }

  for (const [language, files] of Object.entries(catalogue)) {
    const messages = flatten(files);
    const categories = new Set<string>(
      new Intl.PluralRules(language).resolvedOptions().pluralCategories,
    );

    for (const [key, message] of Object.entries(messages)) {
      const base = baseKey(key);
      const category = pluralCategoryOf(key);

      if (!sourceGroups.has(base)) {
        problems.push(`${language}: "${key}" does not exist in the source language — remove it.`);
        continue;
      }

      const sourceIsPlural = sourceGroups.get(base)!.some((k) => pluralCategoryOf(k) !== undefined);

      if (category !== undefined && !sourceIsPlural) {
        problems.push(`${language}: "${key}" is a plural form of a key that has none.`);
      }

      if (category === undefined && sourceIsPlural) {
        problems.push(
          `${language}: "${base}" is a plural group — use "${base}_one", "${base}_other"…`,
        );
      }

      if (category !== undefined && !categories.has(category)) {
        problems.push(
          `${language}: "${key}" — this language has no "${category}" plural form (it has: ${[...categories].join(", ")}).`,
        );
      }

      const allowed = sourcePlaceholders.get(base)!;

      for (const name of placeholdersOf(message)) {
        if (!allowed.has(name)) {
          problems.push(
            `${language}: "${key}" uses {{${name}}}, which the source sentence does not have.`,
          );
        }
      }

      if (language !== SOURCE_LANGUAGE && !sameList(tagsOf(message), sourceTags.get(base)!)) {
        problems.push(
          `${language}: "${key}" must keep the same tags as the source (${
            sourceTags
              .get(base)!
              .map((t) => `<${t}>`)
              .join(" ") || "none"
          }).`,
        );
      }
    }

    if (mustBeComplete(options, language)) {
      const translated = groups(messages);

      for (const base of sourceGroups.keys()) {
        if (!translated.has(base)) {
          problems.push(`${language}: "${base}" is missing, and this language must be complete.`);
        }
      }
    }
  }

  return problems;
}

function mustBeComplete(options: ValidationOptions, language: string): boolean {
  return (options.complete ?? []).includes(language);
}

export interface Completeness {
  translated: number;
  total: number;
  /** Rounded down: 100 means every key, never «almost». */
  percent: number;
}

/**
 * How much of the source each language translates (ADR 0044 §4). A plural
 * group counts once, whatever forms the language needs.
 */
export function completeness(catalogue: Catalogue): Record<string, Completeness> {
  const source = catalogue[SOURCE_LANGUAGE];
  const result: Record<string, Completeness> = {};

  if (source === undefined) {
    return result;
  }

  const sourceBases = new Set(groups(flatten(source)).keys());
  const total = sourceBases.size;

  for (const [language, files] of Object.entries(catalogue)) {
    const bases = groups(flatten(files));
    let translated = 0;

    for (const base of sourceBases) {
      if (bases.has(base)) {
        translated += 1;
      }
    }

    result[language] = {
      translated,
      total,
      percent: total === 0 ? 100 : Math.floor((translated * 100) / total),
    };
  }

  return result;
}

export interface LanguageInfo {
  code: string;
  /** The language's name in itself: «English», «Italiano». */
  name: string;
  percent: number;
  /**
   * The sentence announcing an incomplete translation, in the language itself,
   * with `{{percent}}` still to fill. The bridge language's when this one has
   * not translated it yet.
   */
  incomplete: string;
}

/** Every language, the source first and the rest by code. */
export function languages(catalogue: Catalogue): LanguageInfo[] {
  const shares = completeness(catalogue);
  const bridgeIncomplete = String(catalogue[BRIDGE_LANGUAGE]?.[META_NAMESPACE]?.incomplete ?? "");

  return Object.keys(catalogue)
    .sort((a, b) => (a === SOURCE_LANGUAGE ? -1 : b === SOURCE_LANGUAGE ? 1 : a.localeCompare(b)))
    .map((code) => {
      const meta = catalogue[code]![META_NAMESPACE] ?? {};

      return {
        code,
        name: typeof meta.name === "string" ? meta.name : code,
        percent: shares[code]?.percent ?? 0,
        incomplete: typeof meta.incomplete === "string" ? meta.incomplete : bridgeIncomplete,
      };
    });
}

/** The same list, for one set of namespaces only (a shell script's). */
export function restrict(catalogue: Catalogue, namespaces: readonly string[]): Catalogue {
  const result: Record<string, LocaleFiles> = {};

  for (const [language, files] of Object.entries(catalogue)) {
    const kept: Record<string, Readonly<Record<string, unknown>>> = {};

    for (const namespace of namespaces) {
      if (files[namespace] !== undefined) {
        kept[namespace] = files[namespace];
      }
    }

    result[language] = kept;
  }

  return result;
}
