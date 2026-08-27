/**
 * La memoria del feed fra un ingresso e l'altro nella lente «rete».
 *
 * Due cose vanno tenute ferme insieme, e sono in tensione: **non accorciare
 * l'elenco sotto le dita di chi legge** mentre le case rispondono, e **non
 * tenere in piedi contenuti che una casa non può più autorizzare** quando ha
 * finito di rispondere. La prima è cortesia, la seconda è [ADR 0018] decisione 2.
 */
import type { PostView } from "@estia/contracts";
import { describe, expect, it } from "vitest";

import { soloIlFresco, unisci } from "./feed-memoria.js";

function post(id: string, createdAt: string, likeCount = 0): PostView {
  return {
    author: { displayName: "Anna", id: "u-anna", username: "anna" },
    body: `il post ${id}`,
    canDelete: false,
    canModerate: false,
    commentCount: 0,
    createdAt,
    editedAt: null,
    hidden: false,
    id,
    images: [],
    likeCount,
    liked: false,
    scope: "followers",
  };
}

describe("che cosa resta sullo schermo mentre le case rispondono", () => {
  it("mostra l'unione, dal più recente, senza doppioni", () => {
    const ricordati = [post("b", "2026-08-27T11:00:00.000Z")];
    const freschi = [post("c", "2026-08-27T12:00:00.000Z"), post("a", "2026-08-27T10:00:00.000Z")];

    expect(unisci(ricordati, freschi).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("a parità di id vince quello appena arrivato", () => {
    const ricordati = [post("a", "2026-08-27T10:00:00.000Z", 1)];
    const freschi = [post("a", "2026-08-27T10:00:00.000Z", 9)];

    const uniti = unisci(ricordati, freschi);

    expect(uniti).toHaveLength(1);
    expect(uniti[0]?.likeCount).toBe(9);
  });

  it("l'elenco non si accorcia mentre l'aggiornamento è in corso", () => {
    const ricordati = [
      post("a", "2026-08-27T10:00:00.000Z"),
      post("b", "2026-08-27T11:00:00.000Z"),
    ];

    // La prima casa ha risposto, le altre no: chi legge vede ancora tutto.
    expect(unisci(ricordati, [post("b", "2026-08-27T11:00:00.000Z")])).toHaveLength(2);
  });

  it("alla fine tiene solo il fresco: una casa che tace si porta via i suoi post", () => {
    const freschi = [post("b", "2026-08-27T11:00:00.000Z")];

    // `a` era nella memoria e questa volta non è arrivato. Non resta: un post
    // visitato e non più servito non è più visibile, che è la promessa di ADR 0018.
    expect(soloIlFresco(freschi).map((p) => p.id)).toEqual(["b"]);
  });
});
