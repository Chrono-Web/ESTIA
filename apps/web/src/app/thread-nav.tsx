import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ThreadBack = () => void;

const ThreadNavContext = createContext<{
  back: ThreadBack | null;
  setBack: (handler: ThreadBack | null) => void;
} | null>(null);

/**
 * Indietro nel thread (padre → post → feed), non nella cronologia del browser.
 * La pagina post registra il passo; la TopBar lo esegue.
 */
export function ThreadNavProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [back, setBackState] = useState<ThreadBack | null>(null);
  const setBack = useCallback((handler: ThreadBack | null) => {
    setBackState(() => handler);
  }, []);
  const value = useMemo(() => ({ back, setBack }), [back, setBack]);

  return <ThreadNavContext.Provider value={value}>{children}</ThreadNavContext.Provider>;
}

export function useThreadBack(): ThreadBack | null {
  return useContext(ThreadNavContext)?.back ?? null;
}

/** La pagina dettaglio registra dove porta «indietro» a questo livello del thread. */
export function useRegisterThreadBack(handler: ThreadBack | null): void {
  const ctx = useContext(ThreadNavContext);

  useEffect(() => {
    if (ctx === null) {
      return;
    }

    ctx.setBack(handler);

    return () => {
      ctx.setBack(null);
    };
  }, [ctx, handler]);
}
