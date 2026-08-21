import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api } from "./api.js";
import { useApp } from "./state.js";

/**
 * Quante cose sono successe che riguardano chi sta guardando ([ADR 0025] §4).
 *
 * **Si chiede a intervalli, e non si finge che arrivi da solo.** Un
 * aggiornamento spinto sarebbe la notifica spinta che ADR 0021 §3 rimanda a
 * una decisione sua; qui c'è una domanda ogni tanto, e il fatto che il numero
 * possa essere vecchio di un minuto è il prezzo dichiarato.
 *
 * Sta in un contesto e non in ciascuna barra perché le barre sono due — quella
 * in basso e la sidebar — e due sondaggi per lo stesso numero sarebbero il
 * doppio del lavoro chiesto a un NAS di casa per disegnare la stessa cosa.
 */

/** Ogni quanto si richiede. Un minuto: abbastanza vivo, abbastanza gentile. */
const INTERVALLO = 60_000;

interface StatoNotifiche {
  nuove: number;
  /** Richiede adesso, per esempio dopo aver aperto la pagina. */
  aggiorna: () => Promise<void>;
  /** Il numero è appena stato azzerato dal server: adeguati senza richiedere. */
  imposta: (nuove: number) => void;
}

const NotificheContext = createContext<StatoNotifiche | undefined>(undefined);

export function NotificheProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { token } = useApp();
  const [nuove, setNuove] = useState(0);

  const aggiorna = useCallback(async (): Promise<void> => {
    if (token === undefined) {
      return;
    }

    try {
      setNuove((await api.notificheNuove(token)).nuove);
    } catch {
      // Un conteggio che non arriva non è una notizia da dare: si riproverà.
      // Mostrare un errore per il pallino sarebbe più rumore della cosa stessa.
    }
  }, [token]);

  useEffect(() => {
    if (token === undefined) {
      setNuove(0);
      return;
    }

    let vivo = true;
    const controller = new AbortController();

    const chiedi = async (): Promise<void> => {
      try {
        const esito = await api.notificheNuove(token, controller.signal);

        if (vivo) {
          setNuove(esito.nuove);
        }
      } catch {
        // Come sopra: il silenzio è la risposta giusta a un sondaggio fallito.
      }
    };

    void chiedi();

    const timer = globalThis.setInterval(() => void chiedi(), INTERVALLO);
    // Tornare sulla scheda è il momento in cui il numero conta davvero, ed è
    // anche quello in cui è più probabile che sia vecchio.
    const alRitorno = (): void => {
      if (document.visibilityState === "visible") {
        void chiedi();
      }
    };

    document.addEventListener("visibilitychange", alRitorno);

    return () => {
      vivo = false;
      controller.abort();
      globalThis.clearInterval(timer);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [token]);

  return (
    <NotificheContext.Provider value={{ aggiorna, imposta: setNuove, nuove }}>
      {children}
    </NotificheContext.Provider>
  );
}

export function useNotifiche(): StatoNotifiche {
  const stato = useContext(NotificheContext);

  // Fuori dal provider il pallino semplicemente non esiste: è una cornice che
  // non c'è, non un errore da far esplodere addosso a chi legge una schermata.
  return stato ?? { aggiorna: async () => undefined, imposta: () => undefined, nuove: 0 };
}
