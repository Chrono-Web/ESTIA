import { NavLink } from "react-router-dom";

import { useNotifiche } from "../notifiche.js";
import { useApp } from "../state.js";
import { Icon } from "../ui/index.js";
import { destinazioniPrimarie } from "./destinazioni.js";

/**
 * Le cinque destinazioni primarie, dove arriva il pollice.
 *
 * Home, messaggi, crea, notifiche, profilo. Cerca e impostazioni stanno in
 * alto.
 *
 * **Sotto ogni icona c'è la sua parola**, e la voce corrente ha anche un
 * fondo. Non è ornamento: senza etichetta e con il solo colore a distinguere
 * l'attivo, chi non separa quei due toni non ha **nessun** modo di sapere dove
 * si trova — è il criterio 1.4.1 di WCAG, l'uso del colore. Cinque parole
 * piccole stanno in 375px, e `aria-label` resta comunque per chi ascolta.
 */
export function TabBar(): React.ReactElement {
  const { user } = useApp();
  const { nuove } = useNotifiche();
  const elenco = destinazioniPrimarie(user?.username ?? "");

  return (
    <nav aria-label="Sezioni" className="tabbar">
      {elenco.map((destinazione) => (
        <NavLink
          aria-label={
            destinazione.icona === "bell" && nuove > 0
              ? `${destinazione.etichetta}, ${String(nuove)} da vedere`
              : destinazione.etichetta
          }
          className="tabbar__item"
          end={destinazione.esatta}
          key={destinazione.to}
          to={destinazione.to}
        >
          <span className="tabbar__icon">
            <Icon name={destinazione.icona} size={22} />
            {destinazione.icona === "bell" && nuove > 0 && (
              <span aria-hidden="true" className="pallino">
                {nuove > 99 ? "99+" : nuove}
              </span>
            )}
          </span>
          <span className="tabbar__testo">{destinazione.etichetta}</span>
        </NavLink>
      ))}
    </nav>
  );
}
