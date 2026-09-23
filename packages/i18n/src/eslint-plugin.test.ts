import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, expect, it } from "vitest";

import plugin, { looksLikeText } from "../eslint-plugin.mjs";

// RuleTester runs its cases through the test framework's own hooks when it
// is given them; the types do not declare those static slots.
Object.assign(RuleTester, { afterAll, describe, it });

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const rule = plugin.rules!["no-ui-literal"]!;
const error = [{ messageId: "literal" }];

tester.run("no-ui-literal", rule as never, {
  valid: [
    `const x = <p>{t("feed.title")}</p>;`,
    `const x = <T k="feed.save" />;`,
    `const x = <input aria-label={t("feed.search")} placeholder={t("feed.search")} />;`,
    `const x = <div className="card card--flush" role="group" />;`,
    `const x = <Sezione chiave="lingua" />;`,
    `const x = <Link to="/impostazioni/lingua" />;`,
    `const x = <Icon name="search" size={18} />;`,
    `const x = <div data-palette-id="terracotta" />;`,
    `import { t } from "./i18n/index.js";`,
    `if (event.key === "ArrowDown") {}`,
    `switch (key) { case "Home": break; }`,
    `throw new Error("The page has no #root element.");`,
    `console.warn("Something odd happened here");`,
    `const tipo: "Diretta" | "Gruppo" = "diretta";`,
    `const mappa = { "Una Chiave": 1 };`,
    `const url = "/api/v1/instance";`,
    `const classi = \`palette-card\${attiva ? " palette-card--on" : ""}\`;`,
    `const codice = "invalid_setup_token";`,
    `const data = new Date().toLocaleString("it-IT");`,
    `const glob = import.meta.glob("../../locales/it/*.json");`,
    `this.name = "ApiError";`,
    `headers.authorization = \`Bearer \${token}\`;`,
    `dialog.style.setProperty("--sheet-width", \`\${String(width)}px\`);`,
    `const coppia = \`\${a} \${b}\`;`,
    `const mobile = navigator.userAgent.includes("Mobile");`,
  ],
  invalid: [
    { code: `const x = <p>Salva</p>;`, errors: error },
    { code: `const x = <p>Un momento…</p>;`, errors: error },
    { code: `const x = <input placeholder="cerca" />;`, errors: error },
    { code: `const x = <button aria-label="Chiudi" />;`, errors: error },
    { code: `const x = <img alt="foto" />;`, errors: error },
    { code: `const x = <Sezione titolo="Aspetto" />;`, errors: error },
    { code: `const x = <Choice note="solo per te" />;`, errors: error },
    { code: `const x = <Choice note={salva ? "Salvo…" : t("a.b")} />;`, errors: error },
    { code: `const x = <p>{"Nessun risultato"}</p>;`, errors: error },
    { code: `setErrore("Non sono riuscito a salvare.");`, errors: error },
    { code: `const titolo = "Impostazioni";`, errors: error },
    { code: `const durata = \`\${n} min\`;`, errors: error },
    { code: `return spiega(causa, "Riprova più tardi");`, errors: error },
  ],
});

describe("looksLikeText", () => {
  it("recognises sentences and words people read", () => {
    expect(looksLikeText("Salva")).toBe(true);
    expect(looksLikeText("solo per te")).toBe(true);
    expect(looksLikeText("città")).toBe(true);
    expect(looksLikeText("«ciao»")).toBe(true);
  });

  it("leaves class lists, codes and paths alone", () => {
    expect(looksLikeText("card card--flush")).toBe(false);
    expect(looksLikeText("invalid_setup_token")).toBe(false);
    expect(looksLikeText("/impostazioni/lingua")).toBe(false);
    expect(looksLikeText("https://example.org/a b")).toBe(false);
    expect(looksLikeText("")).toBe(false);
    expect(looksLikeText("123")).toBe(false);
  });
});
