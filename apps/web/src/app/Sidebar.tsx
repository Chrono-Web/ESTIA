import { Fragment, useRef, useState } from "react";
import { NavLink } from "react-router-dom";

import { t } from "../i18n/index.js";
import { useNotifiche } from "../notifiche.js";
import { useApp } from "../state.js";
import { Icon } from "../ui/index.js";
import { destinazioni, type IdDestinazione } from "./destinazioni.js";
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
const GRUPPI: readonly { id: string; voci: readonly IdDestinazione[] }[] = [
  { id: "fare", voci: ["home", "crea", "cerca"] },
  { id: "persone", voci: ["messaggi", "notifiche", "profilo"] },
  { id: "sistema", voci: ["impostazioni"] },
];

/** Il nome del progetto: un marchio, e un marchio non si traduce. */
const MARCHIO = "ESTIA";

export function Sidebar(): React.ReactElement {
  const { instance, user } = useApp();
  const { nuove } = useNotifiche();
  const [menu, setMenu] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const elenco = destinazioni(user?.username ?? "");
  const gruppi = GRUPPI.map((gruppo) => ({
    id: gruppo.id,
    voci: gruppo.voci.map((nome) => {
      const voce = elenco.find((d) => d.id === nome);
      if (voce === undefined) {
        throw new Error(`La sidebar chiama una voce che non esiste più: «${nome}»`);
      }
      return voce;
    }),
  }));

  return (
    <>
      <div className="sidebar">
        <NavLink aria-label={MARCHIO} className="sidebar__brand" end title={MARCHIO} to="/">
          <Icon name="instance" size={20} />
          <span className="sidebar__label">{MARCHIO}</span>
        </NavLink>
        <div className="sidebar__instance">{instance.name}</div>

        <nav aria-label={t("nav.landmark")} className="sidebar__nav">
          {gruppi.map((gruppo, indice) => (
            <Fragment key={gruppo.id}>
              {indice > 0 && <div aria-hidden="true" className="sidebar__stacco" />}
              {gruppo.voci.map((destinazione) => (
                <NavLink
                  aria-label={
                    destinazione.icona === "bell" && nuove > 0
                      ? t("nav.badge", { count: nuove, label: destinazione.etichetta })
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
          aria-label={t("nav.more.title")}
          className="sidebar__item sidebar__altro"
          onClick={() => setMenu(true)}
          ref={menuAnchor}
          title={t("nav.more.title")}
          type="button"
        >
          <Icon name="menu" size={20} />
          <span className="sidebar__label">{t("nav.more.title")}</span>
        </button>
      </div>

      <MenuAltro anchorRef={menuAnchor} onClose={() => setMenu(false)} open={menu} />
    </>
  );
}
