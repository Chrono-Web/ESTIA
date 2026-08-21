import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { applicaAspetto } from "../aspetto.js";
import { Connection } from "../components/Connection.js";
import { useApp } from "../state.js";
import { Sidebar } from "./Sidebar.js";
import { TabBar } from "./TabBar.js";
import { ThreadNavProvider } from "./thread-nav.js";
import { TopBar } from "./TopBar.js";

/**
 * La cornice: top bar + contenuto + tab (mobile) oppure sidebar (desktop).
 */
export function AppShell(): React.ReactElement {
  const { instance, modo } = useApp();
  const { pathname } = useLocation();
  const inImpostazioni = pathname.startsWith("/impostazioni");

  useEffect(() => {
    applicaAspetto();
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.dataset.modo = modo;
    root.dataset.modoTransit = "";
    const fine = globalThis.setTimeout(() => {
      delete root.dataset.modoTransit;
    }, 220);

    return () => globalThis.clearTimeout(fine);
  }, [modo]);

  /*
   * Nelle impostazioni la lente non c'entra: niente terracotta né petrolio,
   * solo il contrasto nero/bianco del testo. Un attributo sulla radice, come
   * per la modalità — così pulsanti, link e voci attive seguono da soli.
   */
  useEffect(() => {
    const root = document.documentElement;

    if (inImpostazioni) {
      root.dataset.neutro = "";
      return () => {
        delete root.dataset.neutro;
      };
    }

    delete root.dataset.neutro;
  }, [inImpostazioni]);

  return (
    <ThreadNavProvider>
      <div className="app">
        <a className="skip-link" href="#contenuto">
          Vai al contenuto
        </a>

        <Sidebar />

        <div className="app__main" id="contenuto" tabIndex={-1}>
          <TopBar />
          <Connection />
          <Outlet />
        </div>

        <aside aria-label="Questa istanza" className="app__aside">
          <div className="card">
            <h2>{instance.name}</h2>
            {instance.description !== undefined && instance.description !== "" && (
              <p className="muted">{instance.description}</p>
            )}
            <p className="muted">
              {instance.memberCount === 1 ? "1 persona" : `${String(instance.memberCount)} persone`}{" "}
              in questa istanza.
            </p>
          </div>
        </aside>

        <TabBar />
      </div>
    </ThreadNavProvider>
  );
}
