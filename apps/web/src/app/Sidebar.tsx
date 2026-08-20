import { NavLink } from "react-router-dom";

import { api } from "../api.js";
import { useApp } from "../state.js";
import { Avatar, Icon, IconButton } from "../ui/index.js";
import { destinazioni } from "./destinazioni.js";

/**
 * La stessa navigazione della barra in basso, in verticale.
 *
 * Una sola colonna per due larghezze: fra 600 e 839 il CSS nasconde le
 * etichette e la stringe a sole icone, sopra le rimette. Due componenti
 * diversi si sarebbero disallineati alla prima voce aggiunta.
 *
 * Nessun menu a scomparsa, a nessuna larghezza: le voci nascoste dietro un
 * pulsante si usano molto meno delle stesse voci esposte, e qui sono quattro.
 */
export function Sidebar(): React.ReactElement {
  const { instance, signOut, token, user } = useApp();
  const elenco = destinazioni(user?.username ?? "");

  const esci = async (): Promise<void> => {
    if (token !== undefined) {
      try {
        await api.logout(token);
      } catch {
        // La sessione può essere già finita: lo stato locale si pulisce comunque.
      }
    }

    signOut();
  };

  return (
    <div className="sidebar">
      <NavLink className="sidebar__brand" end to="/">
        <Icon name="instance" size={22} />
        <span className="sidebar__label">ESTIA</span>
      </NavLink>
      <div className="sidebar__instance">{instance.name}</div>

      <nav aria-label="Sezioni" className="sidebar__nav">
        {elenco.map((destinazione) => (
          <NavLink
            aria-label={destinazione.etichetta}
            className="sidebar__item"
            end={destinazione.esatta}
            key={destinazione.to}
            title={destinazione.etichetta}
            to={destinazione.to}
          >
            <Icon name={destinazione.icona} size={22} />
            <span className="sidebar__label">{destinazione.etichetta}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__spacer" />

      {user !== undefined && (
        <div className="sidebar__person">
          <Avatar displayName={user.displayName} size="sm" username={user.username} />
          <span className="sidebar__person-name">{user.displayName}</span>
          <IconButton icon="logout" label="Esci" onClick={() => void esci()} />
        </div>
      )}
    </div>
  );
}
