import { Outlet, useLocation } from "react-router-dom";

import { SettingsNav } from "./Hub.js";

/**
 * Guscio delle impostazioni: lista a sinistra, dettaglio a destra.
 *
 * Sul telefono una cosa sola è visibile per volta (lista oppure sezione).
 * Sul desktop restano tutte e due. L'altezza è quella dello spazio utile:
 * scorre il pannello, non la pagina.
 */
export function ImpostazioniLayout(): React.ReactElement {
  const { pathname } = useLocation();
  const hub = pathname === "/impostazioni" || pathname === "/impostazioni/";

  return (
    <main className={`settings-page${hub ? " settings-page--hub" : " settings-page--detail"}`}>
      <div className="settings-panel settings-shell">
        <aside aria-label="Sezioni delle impostazioni" className="settings-nav">
          <SettingsNav />
        </aside>
        <div className="settings-detail">
          {hub ? (
            <p className="muted settings-detail-empty">Scegli una sezione a sinistra.</p>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </main>
  );
}
