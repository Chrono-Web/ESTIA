import { describe, expect, it } from "vitest";

import { normalizzaUrlIstanza } from "./url-istanza";

describe("normalizzaUrlIstanza", () => {
  it("rifiuta il vuoto con la prossima mossa", () => {
    const esito = normalizzaUrlIstanza("  ");
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.motivo).toContain("192.168");
    }
  });

  it("aggiunge http se manca lo schema", () => {
    expect(normalizzaUrlIstanza("192.168.1.12:3000")).toEqual({
      ok: true,
      url: "http://192.168.1.12:3000",
    });
  });

  it("accetta un nome .local e toglie il percorso", () => {
    expect(normalizzaUrlIstanza("http://nas.local:3000/accedi")).toEqual({
      ok: true,
      url: "http://nas.local:3000",
    });
  });

  it("rifiuta javascript: e le credenziali nell'URL", () => {
    expect(normalizzaUrlIstanza("javascript:alert(1)").ok).toBe(false);
    const conCredenziali = normalizzaUrlIstanza("http://u:p@192.168.1.12:3000");
    expect(conCredenziali.ok).toBe(false);
  });
});
