# Translating ESTIA

ESTIA was written in Italian: its interface, most of its documents, and many names in its code. This page shows what exists in which language and how you can help.

**The documentation can be translated today. The interface cannot yet**, because its text is still written inside the components. The plan for both, level by level, is in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) §«Internazionalizzazione».

## What exists, in which language

`original` is the source version. ✅ is a translation that matches its original. 🟡 is a translation whose original has changed since. — means nothing yet.

| Level | Document                                           | Italian   | English              |
| ----- | -------------------------------------------------- | --------- | -------------------- |
| D1    | [`README.md`](../README.md)                        | —         | original             |
| D1    | [`GLOSSARY.md`](GLOSSARY.md)                       | bilingual | bilingual            |
| D1    | [`CONTRIBUTING.md`](../CONTRIBUTING.md)            | original  | —                    |
| D1    | [`SECURITY.md`](../SECURITY.md)                    | original  | —                    |
| D2    | [`INSTALLAZIONE.md`](INSTALLAZIONE.md)             | original  | —                    |
| D2    | [`ACCESSO_DA_FUORI.md`](ACCESSO_DA_FUORI.md)       | original  | —                    |
| D3    | [`PRODUCT_VISION.md`](PRODUCT_VISION.md)           | original  | —                    |
| D3    | [`PROJECT_SPEC.md`](PROJECT_SPEC.md)               | original  | —                    |
| D3    | [`ARCHITECTURE.md`](ARCHITECTURE.md)               | original  | —                    |
| D3    | [`SECURITY_BASELINE.md`](SECURITY_BASELINE.md)     | original  | —                    |
| D3    | [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)             | original  | —                    |
| D3    | [`NOTIFICATIONS_GUIDE.md`](NOTIFICATIONS_GUIDE.md) | original  | —                    |
| —     | The web interface                                  | original  | not yet translatable |
| —     | The `estia` command, `install.sh`, the backup CLI  | original  | not yet translatable |

A new language gets a new column. The levels:

- **D1, the front doors.** What someone arriving from outside reads first. English is the priority.
- **D2, the guides for people who install and run an instance.** The most useful translations for people who will actually use ESTIA.
- **D3, the project documents.** Welcome, but they change often, so expect to keep them up to date.
- **D4, the records, are not translated**: the decision records in [`adr/`](adr/), the [`spike/`](spike/) reports, the implementation plan, `RECONCILIATION.md` and `AGENTS.md`. They are minutes of decisions, and two versions of a binding document raise a question nobody should have to answer: which one is right?

## How to translate a document

1. **Read the [glossary](GLOSSARY.md) first.** Words like _casa_, _segnaposto_ or _battito_ have one precise meaning in ESTIA and one agreed translation. If a term you need is missing, add it to the glossary in the same change.
2. **Create the file next to its original**, named `NAME.<language>.md` with an [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) code: `docs/INSTALLAZIONE.en.md`, `docs/INSTALLAZIONE.de.md`. Staying in the same folder keeps every relative link working.
3. **Start with this line**, with the commit your translation is based on:

   ```markdown
   > Translation of [`INSTALLAZIONE.md`](INSTALLAZIONE.md) at commit `abc1234`. If the two differ, the original is right.
   ```

   The commit comes from `git log -1 --format=%h -- docs/INSTALLAZIONE.md`.

4. **Keep what is not prose as it is**: commands, code, file names, environment variables, and links to ADRs. The commands are real, and `estia ripristina` stays `estia ripristina`. The interface is still Italian only, so quote its labels as they appear on screen, with a translation the first time: **Impostazioni** (Settings).
5. **Write it yourself, or read every line of it.** Machine translation is fine as a first draft, but nobody should merge a text that no fluent speaker has read.
6. **Run `pnpm format`.** Prettier checks Markdown too, and CI will reject the change otherwise.
7. **Update the table above**, then open a pull request.

## Keeping a translation current

When the original changes, the translation becomes 🟡. To see what changed since your commit:

```sh
git log --oneline abc1234..HEAD -- docs/INSTALLAZIONE.md
git diff abc1234 HEAD -- docs/INSTALLAZIONE.md
```

Update the text, update the commit in the first line, and set the table back to ✅. An outdated translation stays in place, marked 🟡, rather than being deleted: slightly old is usually better than nothing, as long as it says so.

## Two things that are never translated

- **What people write.** ESTIA does not send posts or messages to a translation service: that would carry them off the instance, against the project's first promise, and would break end-to-end encryption for private messages. If content translation ever exists, it will run on the device.
- **The records.** See D4 above. Whether new decision records should be written in English is a decision the maintainer has not taken yet.

## The interface

Translating the interface needs one step first, called **I0** in the plan: moving every visible sentence out of the components into a catalogue, showing server errors from their stable codes, and formatting dates and plurals with the browser's `Intl` APIs. That step needs decisions the maintainer has not taken yet: the catalogue format, whether a library is needed, where each person's language choice lives. So please **open an issue rather than a pull request** if you want to work on it.

After I0 come English (**I1**), the administration tools (**I2**), and any language contributors bring (**I3**). A translation platform such as Weblate will be considered once the catalogue exists and more than one translator is active. It works on the same files, so the translations stay in this repository either way.
