/**
 * Un invito che punta a `localhost` funziona solo per chi lo ha creato.
 * Questa logica esiste per non spedire a qualcun altro un indirizzo che
 * sulla sua macchina significa «casa sua».
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inviteLinkFor, isLocalOnlyHost } from "./invite-link.js";

const CODICE = "ABCD-EFGH-IJKL";
const PERCORSO = `/entra?codice=${CODICE}`;

beforeEach(() => {
  vi.stubGlobal("__ESTIA_INSTANCE_ORIGIN__", "");
  vi.stubGlobal("location", { origin: "http://localhost:5173" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isLocalOnlyHost", () => {
  it("riconosce i tre nomi che valgono solo sulla propria macchina", () => {
    expect(isLocalOnlyHost("localhost")).toBe(true);
    expect(isLocalOnlyHost("127.0.0.1")).toBe(true);
    expect(isLocalOnlyHost("::1")).toBe(true);
  });

  it("un indirizzo della rete di casa non è locale: è proprio quello che serve", () => {
    expect(isLocalOnlyHost("192.168.1.12")).toBe(false);
    expect(isLocalOnlyHost("nas.local")).toBe(false);
  });
});

describe("inviteLinkFor", () => {
  it("preferisce l'indirizzo che l'istanza ha costruito da sé", () => {
    expect(inviteLinkFor(CODICE, `http://192.168.1.12:3000${PERCORSO}`)).toBe(
      `http://192.168.1.12:3000${PERCORSO}`,
    );
  });

  it("scarta l'indirizzo dell'istanza se è ancora loopback", () => {
    vi.stubGlobal("__ESTIA_INSTANCE_ORIGIN__", "http://192.168.1.12:3000");

    expect(inviteLinkFor(CODICE, `http://localhost:3000${PERCORSO}`)).toBe(
      `http://192.168.1.12:3000${PERCORSO}`,
    );
  });

  it("in sviluppo ripiega sull'origine iniettata da Vite, di solito il NAS", () => {
    vi.stubGlobal("__ESTIA_INSTANCE_ORIGIN__", "http://192.168.1.12:3000/");

    expect(inviteLinkFor(CODICE)).toBe(`http://192.168.1.12:3000${PERCORSO}`);
  });

  it("non usa l'origine iniettata se anche quella è loopback", () => {
    vi.stubGlobal("__ESTIA_INSTANCE_ORIGIN__", "http://127.0.0.1:3000");

    expect(inviteLinkFor(CODICE)).toBe(`http://localhost:5173${PERCORSO}`);
  });

  it("meglio un indirizzo loopback dell'istanza che nessun indirizzo", () => {
    expect(inviteLinkFor(CODICE, `http://localhost:3000${PERCORSO}`)).toBe(
      `http://localhost:3000${PERCORSO}`,
    );
  });

  it("in ultima istanza usa l'origine da cui si sta guardando", () => {
    expect(inviteLinkFor(CODICE)).toBe(`http://localhost:5173${PERCORSO}`);
  });

  it("cifra il codice, che finisce in una query", () => {
    expect(inviteLinkFor("con spazio&e=segni")).toContain("codice=con%20spazio%26e%3Dsegni");
  });
});
