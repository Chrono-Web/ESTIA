import { describe, expect, it } from "vitest";

import { esisteLingua, fraseDiErrore, lingue, traduci, traduciPlurale } from "./index.js";

describe("traduci", () => {
  it("reads the phrase in the requested language", () => {
    expect(traduci("it", "errori.username_taken")).toBe(
      "Questo nome utente è già preso. Scegline un altro.",
    );
    expect(traduci("en", "errori.username_taken")).toBe(
      "This username is already taken. Choose another one.",
    );
  });

  it("falls back to English for a language the table does not have", () => {
    expect(traduci("xx", "errori.username_taken")).toBe(
      "This username is already taken. Choose another one.",
    );
  });

  it("fills placeholders, formatting numbers for the language", () => {
    expect(traduci("en", "errori.bio_troppo_lunga", { massimo: 1000 })).toBe(
      "The description can be at most 1,000 characters.",
    );
    expect(traduci("it", "errori.bio_troppo_lunga", { massimo: 1000 })).toBe(
      "La descrizione non può superare 1000 caratteri.",
    );
  });

  it("leaves a placeholder visible when its value is missing", () => {
    expect(traduci("en", "errori.nome_troppo_lungo")).toContain("{massimo}");
  });
});

describe("traduciPlurale", () => {
  it("chooses the form the count needs in each language", () => {
    expect(traduciPlurale("it", "entrare.persone", 1)).toBe("Una persona in questa istanza.");
    expect(traduciPlurale("it", "entrare.persone", 3)).toBe("3 persone in questa istanza.");
    expect(traduciPlurale("en", "entrare.persone", 1200)).toBe("1,200 people in this instance.");
  });

  it("reads a form the language lacks as its other, and an unknown language in English", () => {
    // Italian has `many` for very large numbers; the table does not need it.
    expect(traduciPlurale("it", "entrare.persone", 1_000_000)).toBe(
      "1.000.000 persone in questa istanza.",
    );
    expect(traduciPlurale("xx", "entrare.persone", 0)).toBe("0 people in this instance.");
  });
});

describe("fraseDiErrore", () => {
  it("shows the phrase of the code, not the instance's message", () => {
    expect(
      fraseDiErrore("it", { code: "invalid_credentials", message: "Username or password..." }),
    ).toBe("Nome utente o password non validi.");
  });

  it("uses the message for a code the table does not know, never the code", () => {
    expect(fraseDiErrore("it", { code: "codice_futuro", message: "Something new." })).toBe(
      "Something new.",
    );
  });

  it("does not mistake inherited object properties for codes", () => {
    expect(fraseDiErrore("it", { code: "constructor", message: "Fallback." })).toBe("Fallback.");
  });

  it("passes the params into the phrase", () => {
    expect(
      fraseDiErrore("it", { code: "nome_troppo_lungo", message: "", params: { massimo: 50 } }),
    ).toBe("Il nome da mostrare non può superare 50 caratteri.");
  });
});

describe("lingue", () => {
  it("lists each language by its own name", () => {
    expect(lingue()).toEqual(
      expect.arrayContaining([
        { codice: "en", nome: "English" },
        { codice: "it", nome: "Italiano" },
      ]),
    );
    expect(esisteLingua("it")).toBe(true);
    expect(esisteLingua("toString")).toBe(false);
  });
});
