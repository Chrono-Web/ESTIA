import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

import { IconButton } from "../ui/index.js";
import { ModeSwitch } from "./ModeSwitch.js";

/**
 * L'intestazione di una schermata: dove sei, e l'azione che riguarda solo
 * questa schermata.
 *
 * Resta in cima quando si scorre, perché su telefono è l'unica cosa che dice
 * dove ci si trova: la barra in basso dice la sezione, non la pagina.
 *
 * La lente sta sulle schermate che cambia (home, cerca, profilo), non sulle
 * impostazioni: lì non decide niente e confonderebbe. L'altezza della barra
 * resta comunque uguale, così il salto fra destinazioni non cambia forma.
 */
export interface ScreenHeadProps {
  title: string;
  /** Un ritorno esplicito, dove la schermata è un dettaglio di un'altra. */
  back?: boolean;
  /**
   * Dove porta la freccia. Se manca, è la cronologia (`-1`) — va bene per le
   * sezioni delle impostazioni. Sul profilo altrui punta a casa: la cronologia
   * spesso è «impostazioni» e confonde.
   */
  backTo?: string;
  /**
   * Mostra la lente Istanza/Rete. Sulle destinazioni primarie è sempre sì;
   * nelle sottosezioni (es. una pagina delle impostazioni) no.
   */
  lente?: boolean;
  children?: ReactNode;
}

export function ScreenHead({
  title,
  back = false,
  backTo,
  lente = false,
  children,
}: ScreenHeadProps): React.ReactElement {
  const navigate = useNavigate();

  return (
    <header className="screen-head">
      {back && (
        <IconButton
          icon="arrow-left"
          label="Torna indietro"
          onClick={() => {
            if (backTo !== undefined) {
              void navigate(backTo);
              return;
            }

            void navigate(-1);
          }}
        />
      )}
      <h1 className="screen-head__title">{title}</h1>
      {lente && <ModeSwitch />}
      {children}
    </header>
  );
}
