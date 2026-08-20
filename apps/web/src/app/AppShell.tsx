import { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { Connection } from "../components/Connection.js";
import { useApp } from "../state.js";
import { Sidebar } from "./Sidebar.js";
import { TabBar } from "./TabBar.js";

/**
 * La cornice: dove stanno le cose alle quattro larghezze.
 *
 * L'adattamento è per **larghezza disponibile**, non per «telefono o
 * computer» — un telefono ruotato e una finestra stretta hanno lo stesso
 * problema — e sta tutto nel CSS: qui si dichiarano le tre regioni una volta
 * sola, e sono le media query a deciderne la forma.
 *
 * Il `<main>` non è qui ma dentro ogni schermata: annidarne due sarebbe
 * scorretto, e ogni schermata sa quanto larga vuole essere la propria colonna.
 */
export function AppShell(): React.ReactElement {
  const { instance, modo } = useApp();

  /*
   * La lente vive sulla radice del documento, non su un contenitore: così
   * ridipinge anche ciò che il browser porta fuori dall'albero — un `<dialog>`
   * modale sta nel livello più alto, e da lì un contenitore non lo raggiunge.
   */
  useEffect(() => {
    document.documentElement.dataset.modo = modo;
  }, [modo]);

  return (
    <div className="app">
      <a className="skip-link" href="#contenuto">
        Vai al contenuto
      </a>

      <Sidebar />

      <div className="app__main" id="contenuto" tabIndex={-1}>
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
  );
}
