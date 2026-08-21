import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { applicaPreferenze } from "../aspetto.js";
import { Connection } from "../components/Connection.js";
import { useApp } from "../state.js";
import { Sidebar } from "./Sidebar.js";
import { TabBar } from "./TabBar.js";
import { ThreadNavProvider } from "./thread-nav.js";
import { TopBar } from "./TopBar.js";

/**
 * La cornice: top bar + contenuto + tab (mobile) oppure sidebar in overlay (desktop).
 */
export function AppShell(): React.ReactElement {
  const { modo } = useApp();
  const { pathname } = useLocation();
  const inImpostazioni = pathname.startsWith("/impostazioni");

  useEffect(() => {
    applicaPreferenze();
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
   * solo il contrasto del testo — così non sembri di pubblicare. Su Aspetto
   * invece gli accenti restano: serve vedere la palette mentre la scegli.
   */
  useEffect(() => {
    const root = document.documentElement;
    const anteprimaAspetto = pathname === "/impostazioni/aspetto";

    if (inImpostazioni && !anteprimaAspetto) {
      root.dataset.neutro = "";
      return () => {
        delete root.dataset.neutro;
      };
    }

    delete root.dataset.neutro;
  }, [inImpostazioni, pathname]);

  return (
    <ThreadNavProvider>
      <div className="app">
        <a className="skip-link" href="#contenuto">
          Vai al contenuto
        </a>

        <Sidebar />

        {/*
         * La lente fluttua sopra il contenuto: `.app__main` occupa tutta
         * l'altezza e scorre sotto; la barra non gli sottrae spazio.
         */}
        <div className="app__frame">
          <TopBar />
          <div className="app__main" id="contenuto" tabIndex={-1}>
            <Connection />
            <Outlet />
          </div>
        </div>

        <TabBar />
      </div>
    </ThreadNavProvider>
  );
}
