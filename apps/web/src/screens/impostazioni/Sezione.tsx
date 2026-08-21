import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { IconButton } from "../../ui/index.js";

/**
 * La cornice di una sezione delle impostazioni.
 *
 * Stesso pannello centrato dell'hub: titolo, ritorno, contenuto.
 */
export interface SezioneProps {
  titolo: string;
  children: ReactNode;
}

export function Sezione({ titolo, children }: SezioneProps): React.ReactElement {
  const navigate = useNavigate();

  return (
    <main className="settings-page">
      <div className="settings-panel">
        <header className="screen-head">
          <IconButton
            icon="arrow-left"
            label="Torna alle impostazioni"
            onClick={() => void navigate("/impostazioni")}
          />
          <h1 className="screen-head__title">{titolo}</h1>
        </header>
        <div className="stack settings-sezione">{children}</div>
      </div>
    </main>
  );
}
