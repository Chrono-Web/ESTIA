# `@estia/i18n` — how ESTIA speaks more than one language

Every sentence ESTIA shows lives in `locales/<language>/<namespace>.json`. The code refers to it by key. The decisions behind this are in [ADR 0044](../../docs/adr/0044-l-interfaccia-parla-piu-lingue.md); this page is the practical guide. If you want to **translate**, read [`docs/TRANSLATIONS.md`](../../docs/TRANSLATIONS.md) instead: you never need to touch code.

## The shape of a catalogue

```text
packages/i18n/locales/
  it/            ← the source language: every key exists here
    meta.json    ← the language's own name, and its "incomplete" sentence
    common.json
    auth.json
    …
  en/            ← the bridge language: complete by rule
    …
```

One file per area (namespace). Inside, **flat** keys, in English, sorted:

```json
{
  "login.submit": "Entra",
  "login.forgot": "Password dimenticata? <link>Usa il codice di recupero</link>",
  "posts_one": "{{count}} post",
  "posts_other": "{{count}} post"
}
```

In code the key carries its file name in front: `auth.login.submit`.

- **Placeholders**: `{{name}}`. Only `count` is formatted as a number of the language (`1.234` / `1,234`); pass anything else already written the way you want it.
- **Plurals**: suffixes from `Intl.PluralRules` — `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`. Italian and English need `_one` and `_other`. `t("feed.posts", { count: n })` picks the form.
- **Rich text**: named tags, never HTML — `<b>…</b>`, `<link>…</link>`. The component decides what they become. Tags do not nest.
- **No plurals in `installer` and `cli`**: shell scripts cannot choose a form, and the checks refuse them there.

## Using it in the web client

```tsx
import { T, t, formatoData, formatoNumero } from "../i18n/index.js";

<h1>{t("settings.title")}</h1>
<p>{t("feed.greeting", { name: user.displayName })}</p>
<p>{t("feed.posts", { count: posts.length })}</p>
<T k="auth.login.invite" tags={{ link: (testo) => <Link to="/entra">{testo}</Link> }} />
```

`<T>` turns `<b>` into `<strong>` by itself; pass `tags` for anything else.

`t()` is type-checked: a key that does not exist, or a missing placeholder, is a compile error. For a key built at runtime use `tChiave(key, params)` and check `haChiave(key)` first when a missing key has a better answer — `errori.ts` does this for server error codes.

### Rules that matter

1. **Never call `t()` at module top level.** A constant computed when the module loads stays in the language of that moment. Keep **keys** in tables and translate at render time, or use getters — see `screens/impostazioni/sezioni.ts` and `registro.ts`:

   ```ts
   const TESTI: Record<Chiave, PlainMessageKey> = { aspetto: "sections.appearance.title" };
   export const titoloSezione = (chiave: Chiave): string => t(TESTI[chiave]);
   ```

   `PlainMessageKey` is the type of a key whose sentence has no placeholder.

2. **Dates and numbers** go through `formatoData`, `formatoNumero`, `formatoElenco`, which use the language in use. Never `toLocaleString("it-IT")`.
3. **Server errors**: show them with `spiega(causa, t("…"))` from `errori.ts`. It uses the sentence of `errors.<code>` with the server's `params`, and falls back to what you pass.
4. **Keep the Italian identical.** When you move a sentence into the catalogue, copy it exactly: the tests assert what people read, in Italian.
5. **Write the English in the same change.** English must be complete; the checks fail otherwise. Write it as ESTIA speaks: plain words of the people who use it, not of the protocol (heuristic 2 of `DESIGN_SYSTEM.md`). Use the terms of [`docs/GLOSSARY.md`](../../docs/GLOSSARY.md).
6. **Tests** may keep asserting Italian text: Italian is the language the page starts in. To test another language, `await impostaLingua("en")` and restore `"it"` in a `finally`.

## Using it in Node

```ts
import { createProcessTranslator } from "@estia/i18n/node";

const { t } = createProcessTranslator(process.env, ["server"]);
process.stdout.write(t("server.setup.title"));
```

The language comes from `ESTIA_LANG`, then the POSIX locale, then English (ADR 0044 §3).

### What the server says to a person

The server does not translate: it sends codes and keys, and the client writes the sentence (ADR 0044 §5).

- **Refusals**: `new DomainError(code, message, status, params)`. The sentence is `errors.<code>` in `errors.json`; `params` fills its placeholders. `apps/core-api/src/errors.test.ts` fails when a code has no Italian sentence or a placeholder has no value.
- **Diagnostics** (at-rest encryption, backups, updates, the network): build the sentence with `diagnosi("diagnostics.…", params)` from `apps/core-api/src/diagnostics.ts`. It returns `detail` — the Italian, rendered from the catalogue, kept for older clients — plus `detailKey` and `detailParams`. The web client shows it with `dettaglio()` from `apps/web/src/dettaglio.ts`.

## The checks

- **`estia/no-ui-literal`** (ESLint, in `eslint-plugin.mjs`): fails on visible text written in the web client's code. A real exception goes on its line, with the reason:
  `// eslint-disable-next-line estia/no-ui-literal -- a brand name, never translated`.
- **`pnpm i18n`**: validates the catalogues and regenerates everything that comes from them — `src/keys.generated.ts`, `src/languages.generated.ts`, the tables inside `install.sh` and `bin/estia`, the table in `docs/TRANSLATIONS.md`. **Run it after every catalogue change.** `pnpm i18n --check` fails if any of those is stale, and a test runs it in CI.
- **The catalogue tests** (`src/catalog.test.ts`): no key a language has and Italian does not, the same placeholders and tags as the source, only plural forms the language has, English complete.

## Adding a language

Copy `locales/it/` to `locales/<code>/`, write the language's own name in `meta.json`, translate what you can, run `pnpm i18n`. The language appears in the pickers with its completeness, and every missing sentence falls back to English, then Italian.
