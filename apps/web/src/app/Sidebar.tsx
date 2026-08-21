import { useState } from "react";
import { NavLink } from "react-router-dom";

import { useApp } from "../state.js";
import { Icon } from "../ui/index.js";
import { destinazioni } from "./destinazioni.js";
import { MenuAltro } from "./MenuAltro.js";

/**
 * La navigazione desktop, stile Threads: icone ed etichette in colonna.
 *
 * Compare da 600px. Cerca e impostazioni stanno qui (sul telefono sono in
 * alto). In fondo «Altro» apre lo stesso menù del burger.
 */
export function Sidebar(): React.ReactElement {
  const { instance, user } = useApp();
  const [menu, setMenu] = useState(false);
  const elenco = destinazioni(user?.username ?? "");

  return (
    <>
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

        <button
          className="sidebar__item sidebar__altro"
          onClick={() => setMenu(true)}
          type="button"
        >
          <Icon name="menu" size={22} />
          <span className="sidebar__label">Altro</span>
        </button>
      </div>

      <MenuAltro onClose={() => setMenu(false)} open={menu} />
    </>
  );
}
