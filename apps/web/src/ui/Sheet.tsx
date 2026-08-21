import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import { IconButton } from "./Button.js";

/**
 * Pannello overlay a tre forme. Una sola API: cambia `variant`.
 *
 * - `pieno` — tutto lo schermo (es. nuovo messaggio)
 * - `piccolo` — card ancorata a un trigger (es. burger, menu ⋯)
 * - `centrato` — dialogo al centro su ogni larghezza (es. follower)
 *
 * `<dialog open>` non basta: solo `showModal()` mette l'elemento nel livello
 * più alto, chiude il fuoco dentro di esso, rende inerte il resto della pagina
 * e fa funzionare Esc.
 */

export type SheetVariant = "pieno" | "piccolo" | "centrato";

export interface SheetProps {
  variant: SheetVariant;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Header standard: titolo + Chiudi. Ignorato se c'è `header`. */
  title?: string;
  /** Header intero a scelta (es. Annulla | titolo). Sostituisce titolo + Chiudi. */
  header?: ReactNode;
  /** Obbligatorio con `variant="piccolo"`: elemento a cui ancorare la card. */
  anchorRef?: RefObject<HTMLElement | null>;
}

const GAP = 8;
const PICCOLO_MAX = 280;

function posizionaPiccolo(dialog: HTMLDialogElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const panelWidth = Math.min(PICCOLO_MAX, window.innerWidth - GAP * 2);
  let left = rect.left;
  left = Math.max(GAP, Math.min(left, window.innerWidth - panelWidth - GAP));

  dialog.style.setProperty("--sheet-width", `${String(panelWidth)}px`);
  dialog.style.setProperty("--sheet-left", `${String(left)}px`);

  // Prima sotto l'ancora; se non ci sta, sopra.
  let top = rect.bottom + GAP;
  const altezza = dialog.offsetHeight;
  if (top + altezza > window.innerHeight - GAP) {
    top = Math.max(GAP, rect.top - GAP - altezza);
  }
  dialog.style.setProperty("--sheet-top", `${String(top)}px`);
}

export function Sheet({
  variant,
  open,
  onClose,
  children,
  title,
  header,
  anchorRef,
}: SheetProps): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (import.meta.env.DEV && variant === "piccolo" && anchorRef === undefined) {
      console.error('Sheet variant="piccolo" richiede anchorRef');
    }
  }, [variant, anchorRef]);

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

  useLayoutEffect(() => {
    if (!open || variant !== "piccolo") {
      return;
    }

    const element = dialog.current;
    const anchor = anchorRef?.current;

    if (element === null || anchor === null || anchor === undefined) {
      return;
    }

    const aggiorna = (): void => {
      posizionaPiccolo(element, anchor);
    };

    aggiorna();
    // Dopo il paint l'altezza del contenuto è stabile.
    const frame = requestAnimationFrame(aggiorna);

    window.addEventListener("resize", aggiorna);
    window.addEventListener("scroll", aggiorna, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", aggiorna);
      window.removeEventListener("scroll", aggiorna, true);
    };
  }, [open, variant, anchorRef, children, title, header]);

  const stilePiccolo: CSSProperties | undefined =
    variant === "piccolo"
      ? ({
          // Valori iniziali: il layout effect li corregge appena il dialog è aperto.
          ["--sheet-top" as string]: "0px",
          ["--sheet-left" as string]: "0px",
          ["--sheet-width" as string]: `${String(PICCOLO_MAX)}px`,
        } as CSSProperties)
      : undefined;

  const testa =
    header !== undefined ? (
      header
    ) : title !== undefined ? (
      <div className="sheet__head">
        <h2 className="sheet__title">{title}</h2>
        <IconButton icon="close" label="Chiudi" onClick={onClose} />
      </div>
    ) : null;

  return (
    <dialog
      className={`sheet sheet--${variant}`}
      // Esc chiude l'elemento da sé: qui si riallinea lo stato di chi lo apre.
      onClose={onClose}
      onClick={(event) => {
        const element = dialog.current;

        if (element === null) {
          return;
        }

        // Click sullo sfondo (::backdrop): le coordinate cadono fuori dal riquadro.
        const box = element.getBoundingClientRect();
        const fuori =
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom;

        if (fuori) {
          onClose();
        }
      }}
      ref={dialog}
      style={stilePiccolo}
    >
      {testa}
      <div className="sheet__body">{children}</div>
    </dialog>
  );
}
