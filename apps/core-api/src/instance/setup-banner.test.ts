import { describe, expect, it } from "vitest";

import { consoleTranslator } from "../console.js";
import { setupBanner } from "./setup-banner.js";

describe("setupBanner — il codice di configurazione nella lingua dell'installazione", () => {
  it("in italiano è la frase di sempre", () => {
    expect(setupBanner(consoleTranslator({ ESTIA_LANG: "it" }), "CODICE-1234")).toBe(
      [
        "",
        "  ESTIA — questa istanza non è ancora configurata.",
        "  Apri l'istanza dal browser sulla rete locale e usa questo codice:",
        "",
        "      CODICE-1234",
        "",
        "  Il codice vale finché il processo resta attivo e non viene registrato nei log.",
        "",
        "",
      ].join("\n"),
    );
  });

  it("un container installato in inglese lo dice in inglese", () => {
    const banner = setupBanner(consoleTranslator({ ESTIA_LANG: "en" }), "CODE-1234");

    expect(banner).toContain("ESTIA — this instance is not set up yet.");
    expect(banner).toContain("      CODE-1234\n");
    expect(banner).not.toMatch(/codice|server\./);
  });

  it("senza ESTIA_LANG segue il sistema, e senza sistema parla inglese", () => {
    expect(setupBanner(consoleTranslator({ LANG: "it_IT.UTF-8" }), "X")).toContain(
      "non è ancora configurata",
    );
    expect(setupBanner(consoleTranslator({ LANG: "C" }), "X")).toContain("not set up yet");
    expect(setupBanner(consoleTranslator({}), "X")).toContain("not set up yet");
  });
});
