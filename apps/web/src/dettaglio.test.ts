/**
 * Le frasi della diagnostica: la chiave quando c'è, il testo dell'istanza
 * quando la chiave manca o questo client non la conosce.
 */
import { describe, expect, it } from "vitest";

import { dettaglio } from "./dettaglio.js";
import { impostaLingua } from "./i18n/index.js";

const ATTIVI = {
  detail: "Attivi. Il primo archivio arriva entro un minuto dall'avvio.",
  detailKey: "diagnostics.backup.waiting",
};

const ULTIMO = {
  detail: "Ultimo 5 ore fa. Ogni 24 ore, tiene gli ultimi 7.",
  detailKey: "diagnostics.backup.healthy_hours",
  detailParams: { count: 5, interval: 24, keep: 7 },
};

describe("dettaglio", () => {
  it("in italiano dice la stessa frase dell'istanza", () => {
    expect(dettaglio(ATTIVI)).toBe(ATTIVI.detail);
    expect(dettaglio(ULTIMO)).toBe(ULTIMO.detail);
  });

  it("nella lingua di chi legge usa la chiave, con i suoi parametri", async () => {
    await impostaLingua("en");

    try {
      expect(dettaglio(ATTIVI)).toBe("On. The first archive arrives within a minute of start-up.");
      expect(dettaglio(ULTIMO)).toBe(
        "Last one 5 hours ago. One every 24 hours, keeping the last 7.",
      );
      // La stessa cosa per un campo con un altro nome.
      expect(dettaglio("Prima i dati", "diagnostics.update.command.save_data.title")).toBe(
        "The data first, then the update",
      );
    } finally {
      await impostaLingua("it");
    }
  });

  it("mostra il testo dell'istanza quando non c'è una chiave", async () => {
    await impostaLingua("en");

    try {
      // Le parole di un'altra istanza: arrivano senza chiave, e restano sue.
      expect(dettaglio({ detail: "Troppe richieste in poco tempo." })).toBe(
        "Troppe richieste in poco tempo.",
      );
      expect(dettaglio("Una nota.", undefined)).toBe("Una nota.");
    } finally {
      await impostaLingua("it");
    }
  });

  it("mostra il testo dell'istanza per una chiave che questo client non conosce", () => {
    expect(
      dettaglio({ detail: "Una frase di un'istanza più nuova.", detailKey: "diagnostics.nuova" }),
    ).toBe("Una frase di un'istanza più nuova.");
  });
});
