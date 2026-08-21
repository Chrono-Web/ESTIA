import { NavLink } from "react-router-dom";

import { useApp } from "../state.js";
import { Icon } from "../ui/index.js";
import { destinazioniPrimarie } from "./destinazioni.js";

/**
 * Le cinque destinazioni primarie, dove arriva il pollice.
 *
 * Home, messaggi, crea, notifiche, profilo — come Threads. Cerca e
 * impostazioni stanno in alto. Solo icone: l'etichetta sarebbe rumore su
 * cinque posti, e `aria-label` dice il nome a chi ascolta.
 */
export function TabBar(): React.ReactElement {
  const { user } = useApp();
  const elenco = destinazioniPrimarie(user?.username ?? "");

  return (
    <nav aria-label="Sezioni" className="tabbar">
      {elenco.map((destinazione) => (
        <NavLink
          aria-label={destinazione.etichetta}
          className="tabbar__item"
          end={destinazione.esatta}
          key={destinazione.to}
          to={destinazione.to}
        >
          <span className="tabbar__icon">
            <Icon name={destinazione.icona} size={24} />
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
