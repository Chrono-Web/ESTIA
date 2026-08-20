import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

import { IconButton } from "../ui/index.js";

/**
 * L'intestazione di una schermata: dove sei, e l'azione che riguarda solo
 * questa schermata.
 *
 * Resta in cima quando si scorre, perché su telefono è l'unica cosa che dice
 * dove ci si trova: la barra in basso dice la sezione, non la pagina.
 */
export interface ScreenHeadProps {
  title: string;
  /** Un ritorno esplicito, dove la schermata è un dettaglio di un'altra. */
  back?: boolean;
  children?: ReactNode;
}

export function ScreenHead({ title, back = false, children }: ScreenHeadProps): React.ReactElement {
  const navigate = useNavigate();

  return (
    <header className="screen-head">
      {back && (
        <IconButton icon="arrow-left" label="Torna indietro" onClick={() => void navigate(-1)} />
      )}
      <h1 className="screen-head__title">{title}</h1>
      {children}
    </header>
  );
}
