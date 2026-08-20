import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { IconButton } from "./Button.js";

/**
 * Una scheda che sale dal basso sul telefono e un dialogo al centro sullo
 * schermo largo. È lo stesso elemento.
 *
 * `<dialog open>` non basta: solo `showModal()` mette l'elemento nel livello
 * più alto, chiude il fuoco dentro di esso, rende inerte il resto della pagina
 * e fa funzionare Esc. Sono quattro comportamenti che riscritti a mano si
 * sbagliano quasi sempre, ed è il motivo per cui questo componente esiste
 * invece di un `<div>` con `position: fixed`.
 */

export interface SheetProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ title, open, onClose, children }: SheetProps): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;

    if (element === null) {
      return;
    }

    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      className="sheet"
      // Esc chiude l'elemento da sé: qui si riallinea lo stato di chi lo apre.
      onClose={onClose}
      onClick={(event) => {
        // Il click fuori dal contenuto arriva al dialogo stesso: è lo sfondo.
        if (event.target === dialog.current) {
          onClose();
        }
      }}
      ref={dialog}
    >
      <div className="sheet__head">
        <h2 className="sheet__title">{title}</h2>
        <IconButton icon="close" label="Chiudi" onClick={onClose} />
      </div>
      <div className="sheet__body">{children}</div>
    </dialog>
  );
}
