import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Composer } from "../components/Composer.js";
import { useSignedIn } from "../state.js";
import { Sheet, type SheetVariant } from "../ui/index.js";

/** Stesso confine del layout (sidebar da 600px). */
function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => globalThis.matchMedia("(min-width: 600px)").matches);

  useEffect(() => {
    const mq = globalThis.matchMedia("(min-width: 600px)");
    const aggiorna = (): void => {
      setDesktop(mq.matches);
    };

    aggiorna();
    mq.addEventListener("change", aggiorna);
    return () => mq.removeEventListener("change", aggiorna);
  }, []);

  return desktop;
}

/**
 * Nuovo messaggio: a tutto schermo sul telefono, dialog centrato sul desktop
 * (come Threads). Non è una pagina nel feed.
 *
 * Annulla o Esc tornano indietro. Pubblicato, si torna alla home.
 */
export function Scrivi(): React.ReactElement {
  const { modo } = useSignedIn();
  const navigate = useNavigate();
  const desktop = useDesktop();
  const feed = modo === "istanza" ? "locale" : "seguiti";
  const variant: SheetVariant = desktop ? "centrato" : "pieno";

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const campo = document.querySelector(".sheet--pieno textarea, .sheet--centrato textarea");

      if (campo instanceof HTMLTextAreaElement) {
        campo.focus();
      }
    });

    return () => cancelAnimationFrame(id);
  }, [variant]);

  const chiudi = (): void => {
    if (globalThis.history.length > 1) {
      void navigate(-1);
      return;
    }

    void navigate("/");
  };

  return (
    <Sheet
      header={
        <header className="sheet__head sheet__head--compose">
          <button className="btn btn--quiet" onClick={chiudi} type="button">
            Annulla
          </button>
          <h1 className="sheet__title">Nuovo messaggio</h1>
          <span aria-hidden="true" className="sheet__head-spazio" />
        </header>
      }
      onClose={chiudi}
      open
      variant={variant}
    >
      <Composer
        feed={feed}
        onPublished={() => {
          void navigate("/");
        }}
      />
    </Sheet>
  );
}
