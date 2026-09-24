import {
  createTranslator,
  type MessageArgs,
  type MessageKey,
  type Params,
  SOURCE_LANGUAGE,
  type Translator,
} from "@estia/i18n";
import { messagesByLanguage, readCatalogue } from "@estia/i18n/node";

/**
 * The sentences the server writes about itself — at-rest encryption, backups,
 * updates, the network — as catalogue keys (ADR 0044 §5).
 *
 * Every such sentence travels twice: as `detail`, the Italian text the
 * interface has always shown and the fallback for a client that does not know
 * the key, and as `detailKey` plus `detailParams`, which the client writes in
 * the reader's language. The Italian is rendered **from the catalogue**, so the
 * two can never say different things: the catalogue is the only place the
 * sentence is written.
 *
 * Logs stay in English and never come from here.
 */

/** A key of the `diagnostics` catalogue, with its namespace. */
export type DiagnosticKey = Extract<MessageKey, `diagnostics.${string}`>;

export interface Diagnosis {
  /** The sentence in the source language, which is what `detail` has always been. */
  detail: string;
  detailKey: DiagnosticKey;
  detailParams?: Record<string, string | number>;
}

let source: Translator | undefined;

function italian(): Translator {
  if (source === undefined) {
    const messages = messagesByLanguage(readCatalogue(), ["diagnostics"]);

    source = createTranslator({
      catalogs: { [SOURCE_LANGUAGE]: messages[SOURCE_LANGUAGE] },
      language: SOURCE_LANGUAGE,
    });
  }

  return source;
}

/**
 * A sentence and its key. The compiler checks that the key exists and that
 * every placeholder has a value.
 */
export function diagnosi<K extends DiagnosticKey>(key: K, ...args: MessageArgs<K>): Diagnosis {
  const params: Params | undefined = args[0];

  return {
    detail: italian().t(key, params),
    detailKey: key,
    ...(params === undefined ? {} : { detailParams: { ...params } }),
  };
}

type Renamed<N extends string> = { [P in N]: string } & { [P in `${N}Key`]: string } & {
  [P in `${N}Params`]?: Record<string, string | number>;
};

/**
 * The same sentence under another field's name: `note`, `noteKey`,
 * `noteParams` for an update command, `memoryWarning…` for the backups.
 */
export function comeCampo<N extends string>(name: N, diagnosis: Diagnosis): Renamed<N> {
  return {
    [name]: diagnosis.detail,
    [`${name}Key`]: diagnosis.detailKey,
    ...(diagnosis.detailParams === undefined ? {} : { [`${name}Params`]: diagnosis.detailParams }),
  } as Renamed<N>;
}
