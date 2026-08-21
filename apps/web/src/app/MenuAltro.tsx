import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { applicaAspetto, leggiAspetto, scriviAspetto, type Aspetto } from "../aspetto.js";
import { api } from "../api.js";
import { useApp } from "../state.js";
import { Choice, Icon, Sheet } from "../ui/index.js";

/**
 * Il menù «altro»: impostazioni, aspetto, esci.
 *
 * Sta dietro il burger in alto a sinistra sul telefono, e dietro «Altro» in
 * fondo alla sidebar sul desktop. Non è un cassetto di navigazione primaria:
 * è ciò che non ha bisogno di un posto fisso nella barra.
 */
export function MenuAltro({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const { signOut, token } = useApp();
  const [aspetto, setAspetto] = useState<Aspetto>(() => leggiAspetto());

  useEffect(() => {
    applicaAspetto(aspetto);
  }, [aspetto]);

  const scegli = (prossimo: Aspetto): void => {
    setAspetto(prossimo);
    scriviAspetto(prossimo);
  };

  const esci = async (): Promise<void> => {
    onClose();

    if (token !== undefined) {
      try {
        await api.logout(token);
      } catch {
        // La sessione può essere già finita.
      }
    }

    signOut();
  };

  return (
    <Sheet onClose={onClose} open={open} title="Menu">
      <nav aria-label="Altro" className="menu-altro">
        <Link className="row" onClick={onClose} to="/impostazioni">
          <span className="row__icon">
            <Icon name="settings" size={20} />
          </span>
          <span className="row__body">
            <span className="row__title">Impostazioni</span>
            <span className="row__note">Presenza, dispositivi, amministrazione</span>
          </span>
        </Link>
      </nav>

      <div className="menu-altro__sezione">
        <h3 className="gruppo">Aspetto</h3>
        <Choice
          checked={aspetto === "sistema"}
          name="aspetto"
          note="Come è impostato il telefono o il computer."
          onChoose={() => scegli("sistema")}
          title="Come il sistema"
        />
        <Choice
          checked={aspetto === "chiaro"}
          name="aspetto"
          note="Sfondo chiaro, anche di notte."
          onChoose={() => scegli("chiaro")}
          title="Chiaro"
        />
        <Choice
          checked={aspetto === "scuro"}
          name="aspetto"
          note="Sfondo scuro, anche di giorno."
          onChoose={() => scegli("scuro")}
          title="Scuro"
        />
      </div>

      <div className="menu-altro__sezione">
        <button className="row" onClick={() => void esci()} type="button">
          <span className="row__icon">
            <Icon name="logout" size={20} />
          </span>
          <span className="row__body">
            <span className="row__title">Esci</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}
