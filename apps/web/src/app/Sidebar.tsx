import { Fragment, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { useNotifiche } from "../notifiche.js";
import { useApp } from "../state.js";
import { Icon } from "../ui/index.js";
import { destinazioni } from "./destinazioni.js";
import { MenuAltro } from "./MenuAltro.js";

/**
 * La navigazione desktop, stile Threads: icone ed etichette in colonna.
 *
 * Compare da 600px, in overlay fisso a sinistra (non sposta il contenuto).
 * Cerca e impostazioni stanno qui (sul telefono sono in alto). In fondo «Altro»
 * apre lo stesso menù del burger.
 *
 * La disposizione in gruppi sta qui, non nelle voci: prima il fare (bacheca,
 * pubblicare, cercare), un respiro, poi le persone (messaggi, notifiche,
 * profilo), un respiro, in fondo il sistema. Le voci restano dichiarate una
 * volta sola in `destinazioni`: qui c'è solo l'ordine e il raggruppamento.
 */
const GRUPPI: readonly { id: string; voci: readonly string[] }[] = [
  { id: "fare", voci: ["Home", "Crea", "Cerca"] },
  { id: "persone", voci: ["Messaggi", "Notifiche", "Profilo"] },
  { id: "sistema", voci: ["Impostazioni"] },
];

export function Sidebar(): React.ReactElement {
  const { instance, user } = useApp();
  const { nuove } = useNotifiche();
  const [menu, setMenu] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const elenco = destinazioni(user?.username ?? "");
  const gruppi = GRUPPI.map((gruppo) => ({
    id: gruppo.id,
    voci: gruppo.voci.map((nome) => {
      const voce = elenco.find((d) => d.etichetta === nome);
      if (voce === undefined) {
        throw new Error(`La sidebar chiama una voce che non esiste più: «${nome}»`);
      }
      return voce;
    }),
  }));

  return (
    <>
      <div className="sidebar">
        <NavLink aria-label="ESTIA" className="sidebar__brand" end title="ESTIA" to="/">
          <Icon name="instance" size={20} />
          <span className="sidebar__label">ESTIA</span>
        </NavLink>
        <div className="sidebar__instance">{instance.name}</div>

        <nav aria-label="Sezioni" className="sidebar__nav">
          {gruppi.map((gruppo, indice) => (
            <Fragment key={gruppo.id}>
              {indice > 0 && <div aria-hidden="true" className="sidebar__stacco" />}
              {gruppo.voci.map((destinazione) => (
                <NavLink
                  aria-label={
                    destinazione.icona === "bell" && nuove > 0
                      ? `${destinazione.etichetta}, ${String(nuove)} da vedere`
                      : destinazione.etichetta
                  }
                  className="sidebar__item"
                  end={destinazione.esatta}
                  key={destinazione.to}
                  title={destinazione.etichetta}
                  to={destinazione.to}
                >
                  <span className="sidebar__icona">
                    <Icon name={destinazione.icona} size={20} />
                    {destinazione.icona === "bell" && nuove > 0 && (
                      <span aria-hidden="true" className="pallino">
                        {nuove > 99 ? "99+" : nuove}
                      </span>
                    )}
                  </span>
                  <span className="sidebar__label">{destinazione.etichetta}</span>
                </NavLink>
              ))}
            </Fragment>
          ))}
        </nav>

        <div className="sidebar__spacer" />

        <button
          aria-expanded={menu}
          aria-haspopup="dialog"
          aria-label="Altro"
          className="sidebar__item sidebar__altro"
          onClick={() => setMenu(true)}
          ref={menuAnchor}
          title="Altro"
          type="button"
        >
          <Icon name="menu" size={20} />
          <span className="sidebar__label">Altro</span>
        </button>
      </div>

      <MenuAltro anchorRef={menuAnchor} onClose={() => setMenu(false)} open={menu} />
    </>
  );
}
