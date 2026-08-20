import { NavLink } from "react-router-dom";

import { useApp } from "../state.js";
import { Icon } from "../ui/index.js";
import { destinazioni } from "./destinazioni.js";

/**
 * Le destinazioni primarie, dove arriva il pollice.
 *
 * Quattro, e non è un numero scelto a caso: una barra persistente regge da tre
 * a cinque voci, e sotto la quinta la scelta smette di essere immediata.
 *
 * **L'etichetta c'è.** Un'icona sola è ambigua — la stessa forma vuol dire
 * «profilo» in un'applicazione e «account» in un'altra — e la parola sotto
 * costa due righe di CSS. `NavLink` mette `aria-current="page"` da sé, ed è
 * quello che il CSS usa per colorare la voce corrente: lo stato attivo si vede
 * anche dal fondo, perché chi non distingue i colori deve sapere dov'è.
 */
export function TabBar(): React.ReactElement {
  const { user } = useApp();
  const elenco = destinazioni(user?.username ?? "");

  return (
    <nav aria-label="Sezioni" className="tabbar">
      {elenco.map((destinazione) => (
        <NavLink
          className="tabbar__item"
          end={destinazione.esatta}
          key={destinazione.to}
          to={destinazione.to}
        >
          <span className="tabbar__icon">
            <Icon name={destinazione.icona} size={22} />
          </span>
          {destinazione.etichetta}
        </NavLink>
      ))}
    </nav>
  );
}
