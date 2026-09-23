/**
 * The catalogues from disk, for everything that runs in Node: the server
 * process, the backup CLI, the generator and the tests (ADR 0044).
 *
 * The web client never imports this: it gets the same files through its
 * bundler, and has no `fs`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { type Catalogue, flatten, type LocaleFiles } from "./catalog.js";
import {
  BRIDGE_LANGUAGE,
  createTranslator,
  languageOfLocale,
  type Messages,
  negotiateLanguage,
  type Translator,
} from "./runtime.js";

/** Where the catalogues are, both in the repository and in the deployed image. */
export function localesDirectory(): string {
  return fileURLToPath(new URL("../locales/", import.meta.url));
}

/** Every language on disk, parsed. A file that is not valid JSON stops everything. */
export function readCatalogue(directory: string = localesDirectory()): Catalogue {
  const catalogue: Record<string, LocaleFiles> = {};

  for (const language of readdirSync(directory).sort()) {
    const path = join(directory, language);

    if (!statSync(path).isDirectory()) {
      continue;
    }

    const files: Record<string, Record<string, unknown>> = {};

    for (const file of readdirSync(path).sort()) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const text = readFileSync(join(path, file), "utf8");

      try {
        files[file.slice(0, -".json".length)] = JSON.parse(text) as Record<string, unknown>;
      } catch (error) {
        throw new Error(`${language}/${file} is not valid JSON: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }

    catalogue[language] = files;
  }

  return catalogue;
}

export type LocaleEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The language a command-line tool should speak (ADR 0044 §3): `ESTIA_LANG`,
 * then whatever the caller knows better than the system (for `estia`, the
 * instance's own language), then the POSIX locale in its order of precedence,
 * then the bridge language.
 */
export function languageFromEnvironment(
  environment: LocaleEnvironment,
  available: readonly string[],
  ...preferred: readonly (string | undefined)[]
): string {
  return negotiateLanguage(
    available,
    [
      environment.ESTIA_LANG,
      ...preferred,
      languageOfLocale(environment.LC_ALL),
      languageOfLocale(environment.LC_MESSAGES),
      languageOfLocale(environment.LANG),
    ],
    BRIDGE_LANGUAGE,
  );
}

/** Every language's flat messages, optionally only some namespaces. */
export function messagesByLanguage(
  catalogue: Catalogue,
  namespaces?: readonly string[],
): Record<string, Messages> {
  const result: Record<string, Messages> = {};

  for (const [language, files] of Object.entries(catalogue)) {
    const kept =
      namespaces === undefined
        ? files
        : Object.fromEntries(Object.entries(files).filter(([name]) => namespaces.includes(name)));

    result[language] = flatten(kept);
  }

  return result;
}

/**
 * A translator for a process that prints to a terminal, in the language its
 * environment asks for.
 */
export function createProcessTranslator(
  environment: LocaleEnvironment = process.env,
  namespaces?: readonly string[],
  ...preferred: readonly (string | undefined)[]
): Translator {
  const catalogue = readCatalogue();
  const language = languageFromEnvironment(environment, Object.keys(catalogue), ...preferred);

  return createTranslator({ catalogs: messagesByLanguage(catalogue, namespaces), language });
}
