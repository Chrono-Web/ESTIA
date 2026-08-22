import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { spiega } from "./errori.js";
import { Icon } from "./ui/icons/Icon.js";

export type AvvisoTone = "neutral" | "error" | "ok";

export interface AvvisoItem {
  id: string;
  tone: AvvisoTone;
  testo: string;
}

export interface StatoAvvisi {
  avvisi: AvvisoItem[];
  /** Mostra un avviso informativo o generico. */
  avvisa: (testo: string, tone?: AvvisoTone) => void;
  /** Mostra un errore spiegato con le regole dell'euristica 9. */
  errore: (causa: unknown, ripiego: string) => void;
  /** Mostra un messaggio di conferma/successo. */
  successo: (testo: string) => void;
  /** Chiude manualmente un avviso dato il suo ID. */
  chiudi: (id: string) => void;
}

const AvvisiContext = createContext<StatoAvvisi | undefined>(undefined);

const DURATA_MS: Record<AvvisoTone, number> = {
  error: 7000,
  neutral: 5000,
  ok: 4000,
};

let counter = 0;

export function AvvisiProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [avvisi, setAvvisi] = useState<AvvisoItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const chiudi = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setAvvisi((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const avvisa = useCallback(
    (testo: string, tone: AvvisoTone = "neutral") => {
      counter += 1;
      const id = `avviso-${Date.now()}-${counter}`;
      const item: AvvisoItem = { id, testo, tone };

      setAvvisi((prev) => [...prev, item]);

      const timeout = setTimeout(() => {
        chiudi(id);
      }, DURATA_MS[tone]);

      timersRef.current.set(id, timeout);
    },
    [chiudi],
  );

  const errore = useCallback(
    (causa: unknown, ripiego: string) => {
      const messaggio = spiega(causa, ripiego);
      avvisa(messaggio, "error");
    },
    [avvisa],
  );

  const successo = useCallback(
    (testo: string) => {
      avvisa(testo, "ok");
    },
    [avvisa],
  );

  useEffect(() => {
    const currentTimers = timersRef.current;
    return () => {
      for (const timer of currentTimers.values()) {
        clearTimeout(timer);
      }
      currentTimers.clear();
    };
  }, []);

  const valore = useMemo(
    () => ({
      avvisa,
      avvisi,
      chiudi,
      errore,
      successo,
    }),
    [avvisa, avvisi, chiudi, errore, successo],
  );

  return (
    <AvvisiContext.Provider value={valore}>
      {children}
      <AvvisiToastContainer avvisi={avvisi} chiudi={chiudi} />
    </AvvisiContext.Provider>
  );
}

export function useAvvisi(): StatoAvvisi {
  const ctx = useContext(AvvisiContext);
  if (ctx === undefined) {
    throw new Error("useAvvisi deve essere usato all'interno di un AvvisiProvider.");
  }
  return ctx;
}

function AvvisiToastContainer({
  avvisi,
  chiudi,
}: {
  avvisi: AvvisoItem[];
  chiudi: (id: string) => void;
}): React.ReactElement | null {
  if (avvisi.length === 0) {
    return null;
  }

  return (
    <div aria-label="Notifiche di sistema" className="avvisi-container" role="region">
      {avvisi.map((item) => (
        <div
          className={`avviso-toast avviso-toast--${item.tone}`}
          key={item.id}
          {...(item.tone === "error" ? { role: "alert" } : { role: "status" })}
        >
          <span className="avviso-toast__icon">
            <Icon
              name={item.tone === "error" ? "alert" : item.tone === "ok" ? "check" : "alert"}
              size={20}
            />
          </span>
          <p className="avviso-toast__text">{item.testo}</p>
          <button
            aria-label="Chiudi notifica"
            className="avviso-toast__close"
            onClick={() => chiudi(item.id)}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
