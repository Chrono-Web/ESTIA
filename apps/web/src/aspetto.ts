/**
 * Preferenza di aspetto: segue il sistema, oppure forza chiaro/scuro.
 * Non è un tema inventato — è solo il controllo su `color-scheme` già previsto
 * dai token. Il default resta il sistema, così chi non tocca niente non cambia.
 */

export type Aspetto = "sistema" | "chiaro" | "scuro";

const CHIAVE = "estia.aspetto";

export function isAspetto(value: unknown): value is Aspetto {
  return value === "sistema" || value === "chiaro" || value === "scuro";
}

export function leggiAspetto(): Aspetto {
  const salvato = globalThis.localStorage?.getItem(CHIAVE);

  return isAspetto(salvato) ? salvato : "sistema";
}

export function scriviAspetto(aspetto: Aspetto): void {
  globalThis.localStorage?.setItem(CHIAVE, aspetto);
  applicaAspetto(aspetto);
}

export function applicaAspetto(aspetto: Aspetto = leggiAspetto()): void {
  const root = document.documentElement;

  if (aspetto === "sistema") {
    delete root.dataset.aspetto;
    return;
  }

  root.dataset.aspetto = aspetto;
}
