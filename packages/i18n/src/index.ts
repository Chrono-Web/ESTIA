/**
 * ESTIA's translations (ADR 0044): the runtime, the catalogue rules, and the
 * types generated from the source language.
 *
 * Browser-safe: nothing here touches the disk. Node code that needs the
 * catalogues from disk imports `@estia/i18n/node`.
 */
import type { MessageParamMap } from "./keys.generated.js";
import type { ParamValue, Params } from "./runtime.js";

export * from "./runtime.js";
export * from "./catalog.js";
export type { MessageParamMap } from "./keys.generated.js";
export { LANGUAGES } from "./languages.generated.js";

/** Every key of the source language, plural groups by their base key. */
export type MessageKey = keyof MessageParamMap;

/** The placeholders a key's sentence takes. */
export type ParamsOf<K extends MessageKey> = { readonly [P in MessageParamMap[K]]: ParamValue };

/**
 * The arguments after the key: nothing for a sentence without placeholders,
 * and exactly its placeholders otherwise — forgetting one is a compile error.
 */
export type MessageArgs<K extends MessageKey> = [MessageParamMap[K]] extends [never]
  ? [params?: Params]
  : [params: ParamsOf<K> & Params];

/**
 * The keys whose sentence takes no placeholder. The type to use for a key kept
 * in a table and translated later, where the compiler cannot see which one.
 */
export type PlainMessageKey = {
  [K in MessageKey]: [MessageParamMap[K]] extends [never] ? K : never;
}[MessageKey];
