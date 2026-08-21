import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { IconButton } from "../../ui/index.js";

/**
 * La cornice di una sezione delle impostazioni.
 *
 * Il guscio (lista | dettaglio) sta nel Layout: qui restano titolo, ritorno sul
 * telefono, e il contenuto. Sul desktop la freccia non serve — la lista è già
 * a sinistra.
 */
export interface SezioneProps {
  titolo: string;
  children: ReactNode;
}

export function Sezione({ titolo, children }: SezioneProps): React.ReactElement {
  const navigate = useNavigate();

  return (
    <>
      <header className="screen-head settings-detail-head">
        <IconButton
          className="settings-back"
          icon="arrow-left"
          label="Torna alle impostazioni"
          onClick={() => void navigate("/impostazioni")}
        />
        <h1 className="screen-head__title">{titolo}</h1>
      </header>
      <div className="stack settings-sezione">{children}</div>
    </>
  );
}
