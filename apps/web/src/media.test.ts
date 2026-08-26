/**
 * Dove il client va a prendere i byte di una fotografia, e con che cosa.
 *
 * Questi test esistono per una ragione precisa: il client mobile ha sbagliato
 * esattamente qui — costruiva sempre l'indirizzo sulla propria istanza, anche
 * per un post che arriva da un'altra casa, e le fotografie della lente «Rete»
 * non caricavano ([ADR 0036](../../../docs/adr/0036-estia-e2e-v1-e-il-debito-verso-mls.md)
 * non c'entra: è il rilievo R3 della revisione del 2026-08-26). Il web lo fa
 * giusto, e da oggi c'è qualcosa che se ne accorge se smette.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetLoadedMedia, mediaObjectUrl } from "./media.js";

const TOKEN = "sessione-di-prova";

function rispostaOk(): Response {
  return { blob: () => Promise.resolve(new Blob(["byte"])), ok: true, status: 200 } as Response;
}

let chiamate: { path: string; init?: RequestInit }[];

beforeEach(() => {
  chiamate = [];
  vi.stubGlobal("fetch", (path: string, init?: RequestInit) => {
    chiamate.push({ path, ...(init === undefined ? {} : { init }) });
    return Promise.resolve(rispostaOk());
  });
  // In Node non esiste: qui interessa quale indirizzo si chiede, non il blob.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (b: Blob) => `blob:finto/${String(b.size)}`,
    revokeObjectURL: () => undefined,
  });
});

afterEach(() => {
  forgetLoadedMedia();
  vi.unstubAllGlobals();
});

describe("l'indirizzo di una fotografia di casa", () => {
  it("chiede la miniatura quando serve la miniatura", async () => {
    await mediaObjectUrl(TOKEN, "abc", "thumbnail");

    expect(chiamate[0]?.path).toBe("/api/v1/media/abc/thumb");
  });

  it("chiede l'originale quando si apre il visore", async () => {
    await mediaObjectUrl(TOKEN, "abc", "original");

    expect(chiamate[0]?.path).toBe("/api/v1/media/abc");
  });

  it("porta la sessione nell'intestazione, mai nell'indirizzo (ADR 0012)", async () => {
    await mediaObjectUrl(TOKEN, "abc", "original");

    expect(chiamate[0]?.init?.headers).toEqual({ authorization: `Bearer ${TOKEN}` });
    expect(chiamate[0]?.path).not.toContain(TOKEN);
  });
});

describe("l'indirizzo di una fotografia che vive in un'altra casa", () => {
  const remoto = { instanceKey: "chiave-altra-casa", utente: "anna" };

  it("passa dalla rotta proxy, non da /media della propria istanza", async () => {
    await mediaObjectUrl(TOKEN, "abc", "original", remoto);

    expect(chiamate[0]?.path).toBe("/api/v1/remote/chiave-altra-casa/anna/media/abc");
  });

  it("la miniatura remota è ancora una miniatura", async () => {
    await mediaObjectUrl(TOKEN, "abc", "thumbnail", remoto);

    expect(chiamate[0]?.path).toBe("/api/v1/remote/chiave-altra-casa/anna/media/abc/thumb");
  });

  it("non confonde la fotografia remota con una di casa che ha lo stesso id", async () => {
    await mediaObjectUrl(TOKEN, "stesso-id", "original");
    await mediaObjectUrl(TOKEN, "stesso-id", "original", remoto);

    expect(chiamate.map((c) => c.path)).toEqual([
      "/api/v1/media/stesso-id",
      "/api/v1/remote/chiave-altra-casa/anna/media/stesso-id",
    ]);
  });

  it("cifra i pezzi dell'indirizzo, perché un nome non è una rotta", async () => {
    await mediaObjectUrl(TOKEN, "id/strano", "original", {
      instanceKey: "chiave/con+segni",
      utente: "nome con spazio",
    });

    expect(chiamate[0]?.path).toBe(
      "/api/v1/remote/chiave%2Fcon%2Bsegni/nome%20con%20spazio/media/id%2Fstrano",
    );
  });
});

describe("la cache", () => {
  it("non richiede due volte la stessa fotografia", async () => {
    await mediaObjectUrl(TOKEN, "abc", "thumbnail");
    await mediaObjectUrl(TOKEN, "abc", "thumbnail");

    expect(chiamate).toHaveLength(1);
  });

  it("tiene separate la miniatura e l'originale", async () => {
    await mediaObjectUrl(TOKEN, "abc", "thumbnail");
    await mediaObjectUrl(TOKEN, "abc", "original");

    expect(chiamate).toHaveLength(2);
  });

  it("non ricorda un fallimento come se fosse un esito", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 404 } as Response));
    await expect(mediaObjectUrl(TOKEN, "abc", "original")).rejects.toThrow("media 404");

    // Il render successivo deve poter riprovare, non ereditare l'errore.
    chiamate = [];
    vi.stubGlobal("fetch", (path: string) => {
      chiamate.push({ path });
      return Promise.resolve(rispostaOk());
    });
    await expect(mediaObjectUrl(TOKEN, "abc", "original")).resolves.toContain("blob:");
    expect(chiamate).toHaveLength(1);
  });

  it("uscendo, non lascia dietro le immagini di quella sessione", async () => {
    await mediaObjectUrl(TOKEN, "abc", "thumbnail");
    forgetLoadedMedia();
    await mediaObjectUrl(TOKEN, "abc", "thumbnail");

    expect(chiamate).toHaveLength(2);
  });
});
