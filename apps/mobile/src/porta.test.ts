import { describe, expect, it } from "vitest";

import { etichettaPorta, valutaPorta } from "./porta";

describe("valutaPorta", () => {
  const base = {
    erroreRete: false,
    feedIncompleto: false,
    inCorso: false,
    raggiungibile: true,
    sessioneRevocata: false,
    url: "http://192.168.1.12:3000",
  };

  it("è unconfigured senza URL, anche se il resto sembra pronto", () => {
    expect(valutaPorta({ ...base, url: undefined })).toBe("unconfigured");
  });

  it("è connecting mentre lavora", () => {
    expect(valutaPorta({ ...base, inCorso: true })).toBe("connecting");
  });

  it("è revoked se la sessione non vale, non un generico errore di rete", () => {
    expect(valutaPorta({ ...base, sessioneRevocata: true })).toBe("revoked");
  });

  it("è degraded se il feed è incompleto ma l'istanza risponde", () => {
    expect(valutaPorta({ ...base, feedIncompleto: true })).toBe("degraded");
  });

  it("è error se non si raggiunge, connected altrimenti", () => {
    expect(valutaPorta({ ...base, erroreRete: true })).toBe("error");
    expect(valutaPorta(base)).toBe("connected");
  });
});

describe("etichettaPorta", () => {
  it("parla come una persona, non come un protocollo", () => {
    expect(etichettaPorta("connecting")).toContain("raggiungendo");
    expect(etichettaPorta("connected")).not.toMatch(/sdk|iroh|tls/i);
  });
});
