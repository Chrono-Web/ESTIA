import { describe, expect, it } from "vitest";

import { type Catalogue, completeness, languages, validate } from "./catalog.js";
import { readCatalogue } from "./node.js";

const meta = (name: string) => ({ name, incomplete: `${name} {{percent}}%` });

function catalogue(extra: Record<string, Record<string, Record<string, unknown>>> = {}): Catalogue {
  return {
    it: {
      meta: meta("Italiano"),
      feed: {
        title: "Bacheca",
        greeting: "Ciao {{name}}",
        posts_one: "{{count}} post",
        posts_other: "{{count}} post",
        save: "Premi <b>Salva</b>",
      },
    },
    en: {
      meta: meta("English"),
      feed: {
        title: "Board",
        greeting: "Hello {{name}}",
        posts_one: "{{count}} post",
        posts_other: "{{count}} posts",
        save: "Press <b>Save</b>",
      },
    },
    ...extra,
  };
}

describe("validate", () => {
  it("accepts a sound catalogue", () => {
    expect(validate(catalogue())).toEqual([]);
  });

  it("refuses a key the source does not have", () => {
    const problems = validate(catalogue({ de: { meta: meta("Deutsch"), feed: { gone: "Weg" } } }));

    expect(problems.join("\n")).toContain(`"feed.gone" does not exist in the source language`);
  });

  it("refuses a placeholder the source sentence does not have", () => {
    const problems = validate(
      catalogue({ de: { meta: meta("Deutsch"), feed: { greeting: "Hallo {{nome}}" } } }),
    );

    expect(problems.join("\n")).toContain("uses {{nome}}");
  });

  it("refuses a plural form the language does not have", () => {
    const problems = validate(
      catalogue({ de: { meta: meta("Deutsch"), feed: { posts_few: "{{count}} Beiträge" } } }),
    );

    expect(problems.join("\n")).toContain(`no "few" plural form`);
  });

  it("refuses a translation that loses a tag", () => {
    const problems = validate(
      catalogue({ de: { meta: meta("Deutsch"), feed: { save: "Drücke Speichern" } } }),
    );

    expect(problems.join("\n")).toContain("must keep the same tags");
  });

  it("requires the bridge language to be complete, and nothing else", () => {
    const partial = catalogue();
    const withoutTitle = {
      ...partial,
      en: { ...partial.en, feed: { greeting: "Hello {{name}}" } },
    };

    expect(validate(withoutTitle).join("\n")).toContain(`en: "feed.title" is missing`);
    expect(validate(catalogue({ de: { meta: meta("Deutsch"), feed: {} } }))).toEqual([]);
  });

  it("requires every language to say its own name", () => {
    expect(validate(catalogue({ de: { feed: {} } })).join("\n")).toContain(`"name" is required`);
  });

  it("refuses nested objects, which translators cannot follow", () => {
    const problems = validate(
      catalogue({ de: { meta: meta("Deutsch"), feed: { title: { text: "Tafel" } } } }),
    );

    expect(problems.join("\n")).toContain("must be a string");
  });

  it("refuses plural forms in the namespaces shell scripts print", () => {
    const withShell = catalogue();
    const problems = validate({
      ...withShell,
      it: { ...withShell.it, installer: { steps_one: "un passo", steps_other: "{{count}} passi" } },
    });

    expect(problems.join("\n")).toContain("shell scripts cannot choose plural forms");
  });
});

describe("completeness", () => {
  it("counts a plural group once, and rounds down", () => {
    const shares = completeness(
      catalogue({
        de: { meta: meta("Deutsch"), feed: { posts_one: "1 Beitrag", title: "Tafel" } },
      }),
    );

    // Six keys in the source: two in meta, four in feed (the plural pair is one).
    expect(shares.de).toEqual({ translated: 4, total: 6, percent: 66 });
    expect(shares.en?.percent).toBe(100);
  });
});

describe("languages", () => {
  it("lists the source first, and borrows the bridge sentence when one is missing", () => {
    const list = languages(catalogue({ de: { meta: { name: "Deutsch" } } }));

    expect(list.map((language) => language.code)).toEqual(["it", "de", "en"]);
    expect(list.find((language) => language.code === "de")?.incomplete).toBe(
      "English {{percent}}%",
    );
  });
});

describe("the catalogues in this repository", () => {
  it("are sound: every rule above holds for the real files", () => {
    expect(validate(readCatalogue())).toEqual([]);
  });
});
