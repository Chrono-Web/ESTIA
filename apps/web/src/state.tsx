import type { AuthenticatedUser, InstancePublicView } from "@estia/contracts";
import { createContext, useContext } from "react";

import type { Modo } from "./modo.js";

export interface AppState {
  instance: InstancePublicView;
  user: AuthenticatedUser | undefined;
  token: string | undefined;
  /** La lente: che cosa si sta guardando, l'istanza o la rete. */
  modo: Modo;
  setModo: (modo: Modo) => void;
  signIn: (token: string, user: AuthenticatedUser) => void;
  signOut: () => void;
  refreshInstance: () => Promise<void>;
  /** Dopo un cambio di nome: la cornice mostra la persona, e deve aggiornarsi. */
  refreshUser: () => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider = AppContext.Provider;

export function useApp(): AppState {
  const state = useContext(AppContext);

  if (state === undefined) {
    throw new Error("useApp usato fuori dal provider.");
  }

  return state;
}

/**
 * Il nome dell'istanza, che il contratto dichiara opzionale.
 *
 * Manca solo finché nessuno l'ha configurata, cioè in uno stato dal quale
 * queste schermate non sono raggiungibili — ma il tipo non lo sa, e scrivere
 * `instance.name!` in dodici punti sarebbe un modo per farsi trovare
 * impreparati il giorno che quello stato cambia.
 */
export function nomeIstanza(instance: InstancePublicView): string {
  return instance.name ?? "questa istanza";
}

/** Narrowed accessor for screens that are only reachable while signed in. */
export function useSignedIn(): AppState & { token: string; user: AuthenticatedUser } {
  const state = useApp();

  if (state.token === undefined || state.user === undefined) {
    throw new Error("Schermata riservata a chi ha una sessione attiva.");
  }

  return { ...state, token: state.token, user: state.user };
}
