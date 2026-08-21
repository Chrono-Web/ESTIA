import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Icon, type IconName } from "./icons/Icon.js";

/**
 * La riga di un elenco: la primitiva su cui sono costruite le impostazioni.
 *
 * Tre forme, e la scelta non è estetica ma semantica: con `to` è un link e il
 * browser sa aprirlo in una scheda nuova; con `onClick` è un pulsante e la
 * tastiera lo attiva con Invio **e** con la barra; senza né l'uno né l'altro è
 * una riga di sola lettura, che non deve finire nel percorso del Tab.
 */

export interface ListRowProps {
  icon?: IconName;
  title: ReactNode;
  note?: ReactNode;
  /** Qualcosa in coda: un valore, un'etichetta, un pulsante. */
  end?: ReactNode;
  /** Un pallino di attenzione: la voce nasconde qualcosa che va guardato. */
  alarm?: boolean;
  /** La riga della sezione aperta nella nav a due colonne. */
  active?: boolean;
  to?: string;
  onClick?: () => void;
}

export function ListRow({
  icon,
  title,
  note,
  end,
  alarm = false,
  active = false,
  to,
  onClick,
}: ListRowProps): React.ReactElement {
  const className = active ? "row row--active" : "row";

  const inside = (
    <>
      {icon !== undefined && (
        <span className="row__icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="row__body">
        <span className="row__title">{title}</span>
        {note !== undefined && <span className="row__note">{note}</span>}
      </span>
      <span className="row__end">
        {alarm && <span className="dot" />}
        {end}
        {(to !== undefined || onClick !== undefined) && <Icon name="chevron-right" size={18} />}
      </span>
    </>
  );

  if (to !== undefined) {
    return (
      <Link aria-current={active ? "page" : undefined} className={className} to={to}>
        {inside}
      </Link>
    );
  }

  if (onClick !== undefined) {
    return (
      <button className={className} onClick={onClick} type="button">
        {inside}
      </button>
    );
  }

  return <div className={className}>{inside}</div>;
}
