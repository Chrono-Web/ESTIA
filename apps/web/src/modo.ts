/**
 * La modalità: la lente con cui si guarda ESTIA.
 *
 * Due stati — l'**istanza**, che non esce di casa, e la **rete**, che raggiunge
 * chi ti segue — e non sono due account: l'identità è una, la bio è una, le
 * impostazioni sono le stesse. Cambia che cosa si vede, e al momento di
 * pubblicare **chi lo leggerà** (ADR 0018, §«Superfici e pubblicazione»).
 *
 * Il default è l'istanza, per la stessa ragione per cui lo scope di un post è
 * `local` quando nessuno dice altro: niente esce di casa per omissione.
 *
 * ADR 0018 ne prevede una terza — il Fediverso — che esiste solo per
 * un'istanza con un dominio. Il tipo la accoglierà senza che nulla cambi.
 */

export const MODI = ["istanza", "rete"] as const;

export type Modo = (typeof MODI)[number];

export const MODO_PREDEFINITO: Modo = "istanza";

const CHIAVE = "estia.modo";

export function isModo(value: unknown): value is Modo {
  return typeof value === "string" && (MODI as readonly string[]).includes(value);
}

export function leggiModo(): Modo {
  const salvato = globalThis.localStorage?.getItem(CHIAVE);

  return isModo(salvato) ? salvato : MODO_PREDEFINITO;
}

export function scriviModo(modo: Modo): void {
  globalThis.localStorage?.setItem(CHIAVE, modo);
}
