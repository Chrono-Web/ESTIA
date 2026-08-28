/**
 * Le parole con cui EstiaNet dice se un'altra casa c'è.
 *
 * La distinzione che questo file esiste per tenere ferma: **«non lo so ancora»
 * non è «non risponde»**. Il battito di ADR 0041 guarda solo le collegate, e
 * una richiesta in attesa non ne ha mai uno — mostrarla come irraggiungibile
 * sarebbe far preoccupare qualcuno per una diagnosi che nessuno ha fatto.
 */
import type { FederatedInstanceView } from "@estia/contracts";
import { describe, expect, it } from "vitest";

import { daQuando, fraQuanto, fraseDi, segnaleDi } from "./raggiungibilita.js";

const ADESSO = new Date("2026-08-27T12:00:00.000Z");

function istanza(patch: Partial<FederatedInstanceView> = {}): FederatedInstanceView {
  return {
    createdAt: "2026-08-20T10:00:00.000Z",
    declaredName: "Via Milano",
    lastReachedVia: null,
    lastSeenAt: null,
    publicKey: "chiave",
    state: "collegata",
    ...patch,
  };
}

describe("che cosa si dice di una casa collegata", () => {
  it("distingue «non lo so ancora» da «non risponde»", () => {
    const appenaVista = istanza();

    expect(segnaleDi(appenaVista)).toBe("in-ascolto");
    expect(fraseDi(appenaVista, ADESSO)).toBe("Il primo controllo parte a momenti.");

    const muta = istanza({
      battito: { prossimoTentativo: "2026-08-27T12:10:00.000Z", raggiungibile: false },
    });

    expect(segnaleDi(muta)).toBe("non-risponde");
  });

  it("non inventa un «adesso» per un'istanza che il battito non guarda", () => {
    for (const state of ["richiesta_inviata", "richiesta_ricevuta", "bloccata"] as const) {
      const altra = istanza({ lastSeenAt: "2026-08-27T11:00:00.000Z", state });

      expect(segnaleDi(altra)).toBe("non-osservata");
      expect(fraseDi(altra, ADESSO)).toBe("Vista l'ultima volta un'ora fa.");
    }
  });

  it("per una casa che non risponde dice anche la prossima mossa", () => {
    const muta = istanza({
      battito: { prossimoTentativo: "2026-08-27T12:20:00.000Z", raggiungibile: false },
      lastReachedVia: "relay",
      lastSeenAt: "2026-08-26T12:00:00.000Z",
    });

    const frase = fraseDi(muta, ADESSO);

    // Lo stato lo dice il segnale accanto: qui ripeterlo produceva «Non
    // risponde. Non risponde. Vista…», e il doppione si vede solo a schermo.
    expect(frase).not.toContain("Non risponde");
    expect(frase).toContain("ieri");
    expect(frase).toContain("attraverso un relay");
    expect(frase).toContain("Riprovo da solo fra 20 minuti");
  });

  it("per una casa che risponde dice quando e per che strada", () => {
    const viva = istanza({
      battito: { prossimoTentativo: "2026-08-27T12:05:00.000Z", raggiungibile: true },
      lastReachedVia: "diretto",
      lastSeenAt: "2026-08-27T11:58:00.000Z",
    });

    expect(segnaleDi(viva)).toBe("raggiungibile");
    expect(fraseDi(viva, ADESSO)).toBe("Ha risposto 2 minuti fa, per collegamento diretto.");
  });
});

describe("il tempo detto in parole intere", () => {
  it("dice quanto tempo fa", () => {
    expect(daQuando("2026-08-27T11:59:30.000Z", ADESSO)).toBe("meno di un minuto fa");
    expect(daQuando("2026-08-27T11:59:00.000Z", ADESSO)).toBe("un minuto fa");
    expect(daQuando("2026-08-27T11:30:00.000Z", ADESSO)).toBe("30 minuti fa");
    expect(daQuando("2026-08-27T11:00:00.000Z", ADESSO)).toBe("un'ora fa");
    expect(daQuando("2026-08-26T12:00:00.000Z", ADESSO)).toBe("ieri");
    expect(daQuando("2026-08-24T12:00:00.000Z", ADESSO)).toBe("3 giorni fa");
    expect(daQuando("2026-08-01T12:00:00.000Z", ADESSO)).toBe("il 1 agosto");
  });

  it("dice fra quanto si riprova, senza promettere i secondi", () => {
    expect(fraQuanto("2026-08-27T11:59:00.000Z", ADESSO)).toBe("a momenti");
    expect(fraQuanto("2026-08-27T12:00:30.000Z", ADESSO)).toBe("a momenti");
    expect(fraQuanto("2026-08-27T12:05:00.000Z", ADESSO)).toBe("fra 5 minuti");
    expect(fraQuanto("2026-08-27T13:00:00.000Z", ADESSO)).toBe("fra un'ora");
  });
});
