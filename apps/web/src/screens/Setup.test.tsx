// @vitest-environment jsdom
/**
 * La configurazione sceglie la lingua dell'istanza (ADR 0044 §3).
 *
 * Due promesse che nessun tipo controlla: la lingua in uso arriva all'istanza
 * come sua lingua predefinita, e cambiarla a metà — che ridisegna tutta la
 * pagina da capo — non butta via il codice appena scritto.
 */
import type { InstancePublicView } from "@estia/contracts";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "../api.js";

vi.mock("../api.js", async (importOriginal) => {
  const reale = await importOriginal<typeof ApiModule>();

  return {
    ...reale,
    api: {
      setup: vi.fn().mockResolvedValue({ recoveryCode: "AAAA-BBBB-CCCC-DDDD" }),
      verifySetupToken: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { api } from "../api.js";
import { impostaLingua, LinguaRoot, scriviSceltaLocale } from "../i18n/index.js";
import { AppProvider, type AppState } from "../state.js";
import { Setup } from "./Setup.js";

const STATO: AppState = {
  instance: { memberCount: 0, publicKey: "chiave", state: "unconfigured" } as InstancePublicView,
  modo: "istanza",
  refreshInstance: async () => {},
  refreshUser: async () => {},
  setModo: () => {},
  signIn: () => {},
  signOut: () => {},
  token: undefined,
  user: undefined,
};

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  scriviSceltaLocale(undefined);
  await impostaLingua("it");
});

function monta(): void {
  render(
    <LinguaRoot>
      <AppProvider value={STATO}>
        <Setup />
      </AppProvider>
    </LinguaRoot>,
  );
}

async function premi(nome: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
}

function scrivi(etichetta: string, valore: string): void {
  fireEvent.change(screen.getByLabelText(etichetta), { target: { value: valore } });
}

describe("Setup", () => {
  it("manda all'istanza la lingua in uso", async () => {
    monta();

    scrivi("Codice", "abc");
    await premi("Avanti");
    scrivi("Nome dell'istanza", "Via Roma");
    await premi("Avanti");
    scrivi("Nome utente", "palu");
    scrivi("Password", "una password lunga abbastanza");
    await premi("Avanti");
    await premi("Crea l'istanza");

    expect(api.setup).toHaveBeenCalledWith(expect.objectContaining({ language: "it" }));
  });

  it("cambia lingua subito, senza perdere il codice già scritto", async () => {
    monta();

    scrivi("Codice", "abc");

    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: /English/ }));
    });

    expect(await screen.findByRole("heading", { name: "The setup code" })).toBeTruthy();
    expect((screen.getByLabelText("Code") as HTMLInputElement).value).toBe("abc");

    await premi("Next");
    scrivi("Instance name", "Elm Street");
    await premi("Next");
    scrivi("Username", "palu");
    scrivi("Password", "a long enough password");
    await premi("Next");
    await premi("Create the instance");

    expect(api.setup).toHaveBeenCalledWith(
      expect.objectContaining({ language: "en", setupToken: "abc" }),
    );
  });
});
