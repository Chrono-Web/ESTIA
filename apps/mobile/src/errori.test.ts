import { describe, expect, it } from "vitest";

import { ApiError, isSessioneMorta, spiega } from "./errori";

describe("spiega", () => {
  it("usa il messaggio dell'istanza quando c'è", () => {
    expect(spiega(new ApiError("invalid_credentials", "Credenziali non valide.", 401), "no")).toBe(
      "Credenziali non valide.",
    );
  });

  it("non mostra il testo di fetch quando la rete non risponde", () => {
    expect(spiega(new TypeError("Failed to fetch"), "ripiego")).toContain("raggiungere");
  });
});

describe("isSessioneMorta", () => {
  it("riconosce un 401 e ignora il resto", () => {
    expect(isSessioneMorta(new ApiError("unauthorized", "no", 401))).toBe(true);
    expect(isSessioneMorta(new ApiError("not_found", "no", 404))).toBe(false);
    expect(isSessioneMorta(new Error("no"))).toBe(false);
  });
});
