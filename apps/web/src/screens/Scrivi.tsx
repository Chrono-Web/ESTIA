import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Composer } from "../components/Composer.js";
import { useSignedIn } from "../state.js";

/**
 * Nuovo messaggio: popup centrato (stile Threads), non una pagina nel feed.
 *
 * Annulla o Esc tornano indietro. Pubblicato, si torna alla home.
 */
export function Scrivi(): React.ReactElement {
  const { modo } = useSignedIn();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const feed = modo === "istanza" ? "locale" : "seguiti";

  useEffect(() => {
    const element = dialog.current;

    if (element === null) {
      return;
    }

    if (!element.open) {
      element.showModal();
    }

    const campo = element.querySelector("textarea");

    if (campo instanceof HTMLTextAreaElement) {
      campo.focus();
    }
  }, []);

  const chiudi = (): void => {
    if (globalThis.history.length > 1) {
      void navigate(-1);
      return;
    }

    void navigate("/");
  };

  return (
    <dialog
      className="compose-modal"
      onClose={chiudi}
      onClick={(event) => {
        if (event.target === dialog.current) {
          chiudi();
        }
      }}
      ref={dialog}
    >
      <header className="compose-modal__head">
        <button className="btn btn--quiet" onClick={chiudi} type="button">
          Annulla
        </button>
        <h1 className="compose-modal__titolo">Nuovo messaggio</h1>
        <span className="compose-modal__spazio" aria-hidden="true" />
      </header>
      <div className="compose-modal__body">
        <Composer
          feed={feed}
          onPublished={() => {
            void navigate("/");
          }}
          variant="modal"
        />
      </div>
    </dialog>
  );
}
