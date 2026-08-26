// @vitest-environment jsdom
/**
 * Le regole di accessibilità che questi componenti dichiarano nei propri
 * commenti, provate invece che promesse.
 *
 * Sono il genere di cosa che regredisce in silenzio: togliere un `role="alert"`
 * non rompe nessun tipo, non fa fallire nessuna build, e nessuno se ne accorge
 * finché qualcuno non usa uno screen reader.
 *
 * È anche il primo test di componente del client web ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)):
 * fin qui l'interfaccia non ne aveva nessuno.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Alert, Badge, EmptyState, Live, SkeletonPost } from "./Feedback.js";

afterEach(cleanup);

describe("Alert", () => {
  it("annuncia un errore, perché quello interrompe a ragione", () => {
    render(<Alert tone="error">Non riesco a raggiungere l&apos;istanza.</Alert>);

    const avviso = screen.getByRole("alert");
    expect(avviso.textContent).toContain("Non riesco a raggiungere l'istanza.");
  });

  it("NON annuncia un avviso neutro: interromperebbe per cose che non riguardano", () => {
    render(<Alert>Qualche casa non ha risposto.</Alert>);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Qualche casa non ha risposto.")).toBeTruthy();
  });

  it("nemmeno un esito riuscito interrompe", () => {
    render(<Alert tone="ok">Fatto.</Alert>);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Live", () => {
  it("sta nel documento anche vuoto: una regione live che nasce piena arriva tardi", () => {
    const { container } = render(<Live />);

    const regione = container.querySelector("[aria-live]");
    expect(regione).not.toBeNull();
    expect(regione?.getAttribute("aria-live")).toBe("polite");
    expect(regione?.textContent).toBe("");
  });

  it("annuncia con cortesia, non interrompendo", () => {
    render(<Live>Carico la bacheca…</Live>);

    expect(screen.getByText("Carico la bacheca…").getAttribute("aria-live")).toBe("polite");
  });
});

describe("EmptyState", () => {
  it("dice che cosa si può fare adesso: uno stato vuoto muto è un vicolo cieco", () => {
    render(
      <EmptyState title="Nessun messaggio privato">
        <button type="button">Inizia una chat</button>
      </EmptyState>,
    );

    expect(screen.getByText("Nessun messaggio privato")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Inizia una chat" })).toBeTruthy();
  });
});

describe("SkeletonPost", () => {
  it("è nascosto a chi non guarda: uno scheletro non è contenuto", () => {
    const { container } = render(<SkeletonPost />);

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Badge", () => {
  it("un tono che non esiste non lascia il badge senza classe", () => {
    // `BADGE_TONE` è indicizzato per stringa: senza il ripiego, un tono
    // sconosciuto darebbe `className={undefined}` e un badge invisibile.
    render(<Badge tone={"inventato" as "neutral"}>7</Badge>);

    expect(screen.getByText("7").className).toBe("badge");
  });
});
