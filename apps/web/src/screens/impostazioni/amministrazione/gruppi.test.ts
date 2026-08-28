/**
 * Quali azioni valgono per quale stato di una casa.
 *
 * Viveva dentro il JSX di EstiaNet, dove nessun test la vedeva: quattro rami
 * con da una a quattro azioni ciascuno, e ogni aggiunta è un'occasione di
 * offrire «Accetta» a una casa che non ha chiesto niente. Qui le regole che
 * contano stanno ferme.
 */
import type { FederatedInstanceView } from "@estia/contracts";
import { describe, expect, it } from "vitest";

import {
  ASPETTO,
  GRUPPI,
  chiedeConferma,
  gruppoDi,
  principaliDi,
  secondarieDi,
  type Azione,
} from "./gruppi.js";

function istanza(state: FederatedInstanceView["state"]): FederatedInstanceView {
  return {
    createdAt: "2026-08-20T10:00:00.000Z",
    declaredName: "Via Milano",
    lastReachedVia: null,
    lastSeenAt: null,
    publicKey: "chiave",
    state,
  };
}

describe("in che gruppo cade una casa", () => {
  it("ogni stato cade in un gruppo solo, e i quattro gruppi sono coperti", () => {
    const stati = ["richiesta_ricevuta", "richiesta_inviata", "collegata", "bloccata"] as const;
    const trovati = stati.map((state) => gruppoDi(istanza(state)));

    expect(new Set(trovati).size).toBe(4);
    expect([...trovati].sort()).toEqual([...GRUPPI].sort());
  });

  it("ogni gruppo ha un nome, un'icona e una tinta", () => {
    for (const gruppo of GRUPPI) {
      expect(ASPETTO[gruppo].titolo).not.toBe("");
      expect(ASPETTO[gruppo].icona).not.toBe("");
    }
  });

  it("le tinte disponibili nelle impostazioni sono tre, più il testo pieno", () => {
    // `data-neutro` collassa `--accent` sul testo: un quarto colore non esiste
    // senza un token nuovo. Il gruppo che ne resta senza è uno solo.
    const tinte = GRUPPI.map((gruppo) => ASPETTO[gruppo].tinta);

    expect(tinte.filter((tinta) => tinta === "")).toHaveLength(1);
    expect(new Set(tinte).size).toBe(4);
  });
});

describe("che cosa si può fare a una casa", () => {
  it("«Accetta» esiste solo per chi ha chiesto, e non è sepolta nel menu", () => {
    expect(principaliDi("in-arrivo")).toContain("accetta");

    for (const gruppo of GRUPPI) {
      expect(secondarieDi(gruppo)).not.toContain("accetta");

      if (gruppo !== "in-arrivo") {
        expect(principaliDi(gruppo)).toHaveLength(0);
      }
    }
  });

  it("la via d'uscita sta accanto all'azione: Rifiuta con Accetta", () => {
    expect(principaliDi("in-arrivo")).toEqual(["accetta", "rifiuta"]);
  });

  it("nessuna azione compare due volte sulla stessa riga", () => {
    for (const gruppo of GRUPPI) {
      const tutte: Azione[] = [...principaliDi(gruppo), ...secondarieDi(gruppo)];

      expect(new Set(tutte).size).toBe(tutte.length);
    }
  });

  it("ogni casa si può copiare, e da ogni gruppo si esce", () => {
    for (const gruppo of GRUPPI) {
      expect(secondarieDi(gruppo)).toContain("copia");
    }

    expect(secondarieDi("bloccata")).toContain("dimentica");
  });

  it("quello che toglie qualcosa chiede prima", () => {
    for (const gruppo of GRUPPI) {
      for (const azione of secondarieDi(gruppo)) {
        if (azione === "blocca" || azione === "dimentica") {
          expect(chiedeConferma(azione)).toBe(true);
        }
      }
    }

    expect(chiedeConferma("verifica")).toBe(false);
    expect(chiedeConferma("copia")).toBe(false);
  });
});
