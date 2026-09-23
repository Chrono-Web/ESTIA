import { describe, expect, it } from "vitest";

import {
  createTranslator,
  fallbackChain,
  interpolate,
  languageOfLocale,
  negotiateLanguage,
  splitRich,
} from "./runtime.js";

const catalogs = {
  it: {
    "feed.title": "Bacheca",
    "feed.greeting": "Ciao {{name}}",
    "feed.posts_one": "{{count}} post",
    "feed.posts_other": "{{count}} post",
    "feed.only_in_italian": "Solo qui",
    "feed.save": "Premi <b>Salva</b> quando hai finito",
  },
  en: {
    "feed.title": "Board",
    "feed.greeting": "Hello {{name}}",
    "feed.posts_one": "{{count}} post",
    "feed.posts_other": "{{count}} posts",
    "feed.save": "Press <b>Save</b> when you are done",
  },
  pl: {
    "feed.title": "Tablica",
    "feed.posts_one": "{{count}} wpis",
    "feed.posts_few": "{{count}} wpisy",
    "feed.posts_many": "{{count}} wpisów",
    "feed.posts_other": "{{count}} wpisu",
  },
};

describe("createTranslator", () => {
  it("finds a key in the language asked for", () => {
    expect(createTranslator({ catalogs, language: "en" }).t("feed.title")).toBe("Board");
  });

  it("fills placeholders", () => {
    const { t } = createTranslator({ catalogs, language: "it" });

    expect(t("feed.greeting", { name: "Marco" })).toBe("Ciao Marco");
  });

  it("leaves a placeholder without a value visible, so the bug is seen", () => {
    expect(createTranslator({ catalogs, language: "it" }).t("feed.greeting")).toBe("Ciao {{name}}");
  });

  it("picks the plural form with the rules of the language", () => {
    const en = createTranslator({ catalogs, language: "en" });
    const pl = createTranslator({ catalogs, language: "pl" });

    expect(en.t("feed.posts", { count: 1 })).toBe("1 post");
    expect(en.t("feed.posts", { count: 3 })).toBe("3 posts");
    expect(pl.t("feed.posts", { count: 3 })).toBe("3 wpisy");
    expect(pl.t("feed.posts", { count: 5 })).toBe("5 wpisów");
  });

  it("formats the count as a number of the language, and nothing else", () => {
    const it_ = createTranslator({ catalogs, language: "it" });
    const en = createTranslator({ catalogs, language: "en" });

    expect(it_.t("feed.posts", { count: 12345 })).toBe("12.345 post");
    expect(en.t("feed.posts", { count: 12345 })).toBe("12,345 posts");
    expect(interpolate("it", "Anno {{year}}", { year: 2026 })).toBe("Anno 2026");
  });

  it("falls back to the bridge language, then to the source", () => {
    const pl = createTranslator({ catalogs, language: "pl" });

    expect(pl.t("feed.greeting", { name: "Ola" })).toBe("Hello Ola");
    expect(pl.t("feed.only_in_italian")).toBe("Solo qui");
  });

  it("uses the plural rules of the language that answers, not the one that asked", () => {
    // German has no catalogue here: English answers, with English rules.
    const de = createTranslator({ catalogs, language: "de" });

    expect(de.t("feed.posts", { count: 3 })).toBe("3 posts");
  });

  it("returns the key and reports it once when no language has it", () => {
    const missing: string[] = [];
    const { t } = createTranslator({
      catalogs,
      language: "en",
      onMissing: (key) => missing.push(key),
    });

    expect(t("feed.nope")).toBe("feed.nope");
    expect(t("feed.nope")).toBe("feed.nope");
    expect(missing).toEqual(["feed.nope"]);
  });

  it("answers a plural key asked for without a count with its general form", () => {
    expect(createTranslator({ catalogs, language: "en" }).t("feed.posts")).toBe("{{count}} posts");
  });

  it("splits rich text into segments", () => {
    expect(createTranslator({ catalogs, language: "en" }).rich("feed.save")).toEqual([
      "Press ",
      { tag: "b", text: "Save" },
      " when you are done",
    ]);
  });
});

describe("splitRich", () => {
  it("keeps text without tags whole", () => {
    expect(splitRich("Nothing here")).toEqual(["Nothing here"]);
  });

  it("reads self-closing tags", () => {
    expect(splitRich("One<br/>two")).toEqual(["One", { tag: "br", text: "" }, "two"]);
  });

  it("does not treat a lone angle bracket as a tag", () => {
    expect(splitRich("3 < 4 and 5 > 2")).toEqual(["3 < 4 and 5 > 2"]);
  });
});

describe("negotiateLanguage", () => {
  const available = ["it", "en"];

  it("takes the first wish it has", () => {
    expect(negotiateLanguage(available, ["de", "it", "en"])).toBe("it");
  });

  it("matches a regional wish by its language", () => {
    expect(negotiateLanguage(available, ["en-GB"])).toBe("en");
    expect(negotiateLanguage(available, ["it_IT"])).toBe("it");
  });

  it("skips empty wishes", () => {
    expect(negotiateLanguage(available, [undefined, "", null, "it"])).toBe("it");
  });

  it("ends on the bridge language", () => {
    expect(negotiateLanguage(available, ["fr"])).toBe("en");
  });
});

describe("languageOfLocale", () => {
  it("reads a POSIX locale", () => {
    expect(languageOfLocale("en_US.UTF-8")).toBe("en-US");
    expect(languageOfLocale("it_IT@euro")).toBe("it-IT");
  });

  it("finds no language in C and POSIX", () => {
    expect(languageOfLocale("C.UTF-8")).toBeUndefined();
    expect(languageOfLocale("POSIX")).toBeUndefined();
    expect(languageOfLocale(undefined)).toBeUndefined();
  });
});

describe("fallbackChain", () => {
  it("is the language, the bridge, the source, without repeats", () => {
    expect(fallbackChain("de")).toEqual(["de", "en", "it"]);
    expect(fallbackChain("it")).toEqual(["it", "en"]);
    expect(fallbackChain("en")).toEqual(["en", "it"]);
  });
});
