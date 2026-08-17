import { NavLink, Outlet } from "react-router-dom";

import { api } from "../api.js";
import { Connection } from "./Connection.js";
import { useApp } from "../state.js";

export function Shell(): React.ReactElement {
  const { instance, signOut, token, user } = useApp();

  const leave = async (): Promise<void> => {
    if (token !== undefined) {
      try {
        await api.logout(token);
      } catch {
        // The session may already be gone; the local state is cleared anyway.
      }
    }

    signOut();
  };

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink className="brand" to="/">
          ESTIA
        </NavLink>
        <span className="muted">{instance.name}</span>

        {user !== undefined && (
          <nav>
            <NavLink end to="/">
              Bacheca
            </NavLink>
            <NavLink to="/dispositivi">Dispositivi</NavLink>
            {user.role === "instance_admin" && (
              <NavLink to="/amministrazione">Amministrazione</NavLink>
            )}
          </nav>
        )}

        <span className="spacer" />

        {user !== undefined && (
          <>
            <span className="who">{user.displayName}</span>
            <button className="quiet" onClick={() => void leave()} type="button">
              Esci
            </button>
          </>
        )}
      </header>

      <Connection />
      <Outlet />
    </div>
  );
}
