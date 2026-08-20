import type { AuthenticatedUser, InstancePublicView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "./api.js";
import { AppShell } from "./app/AppShell.js";
import { forgetLoadedMedia } from "./media.js";
import { leggiModo, scriviModo, type Modo } from "./modo.js";
import { Admin } from "./screens/Admin.js";
import { Devices } from "./screens/Devices.js";
import { Cerca } from "./screens/Cerca.js";
import { Home } from "./screens/Home.js";
import { Impostazioni } from "./screens/Impostazioni.js";
import { Join } from "./screens/Join.js";
import { Login } from "./screens/Login.js";
import { Profilo } from "./screens/Profilo.js";
import { Recover } from "./screens/Recover.js";
import { Setup } from "./screens/Setup.js";
import { clearSession, loadSession, storeSession } from "./session.js";
import { AppProvider } from "./state.js";

export function App(): React.ReactElement {
  const [instance, setInstance] = useState<InstancePublicView | undefined>();
  const [user, setUser] = useState<AuthenticatedUser | undefined>();
  const [token, setToken] = useState<string | undefined>();
  const [modo, setModoState] = useState<Modo>(() => leggiModo());
  const [failure, setFailure] = useState<string | undefined>();
  const [ready, setReady] = useState(false);

  const refreshInstance = useCallback(async () => {
    setInstance(await api.instance());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setInstance(await api.instance());

        const stored = loadSession();

        if (stored !== undefined) {
          try {
            // The stored token may have been revoked from another device.
            setUser(await api.me(stored.token));
            setToken(stored.token);
          } catch {
            clearSession();
          }
        }
      } catch {
        setFailure("Non riesco a contattare l'istanza.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const signIn = useCallback((newToken: string, newUser: AuthenticatedUser) => {
    storeSession({ token: newToken, user: newUser });
    setToken(newToken);
    setUser(newUser);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    // Images already fetched go with the session that fetched them (ADR 0012).
    forgetLoadedMedia();
    setToken(undefined);
    setUser(undefined);
  }, []);

  /** La lente sopravvive alla chiusura della pagina: è un contesto, non un gesto. */
  const setModo = useCallback((next: Modo) => {
    scriviModo(next);
    setModoState(next);
  }, []);

  if (!ready) {
    return <p className="centered">Un momento…</p>;
  }

  if (failure !== undefined || instance === undefined) {
    return (
      <main className="column column--narrow">
        <div className="card">
          <h1>Istanza non raggiungibile</h1>
          <p className="muted">
            Il server dell'istanza non risponde. Se sei fuori casa, ricorda che ESTIA vive sulla
            rete locale della tua comunità.
          </p>
        </div>
      </main>
    );
  }

  const state = { instance, modo, refreshInstance, setModo, signIn, signOut, token, user };

  // Nothing else is reachable until someone has claimed this instance.
  if (instance.state === "unconfigured") {
    return (
      <AppProvider value={state}>
        <Setup />
      </AppProvider>
    );
  }

  /** Una schermata che non esiste per chi non è entrato. */
  const riservata = (schermata: React.ReactElement): React.ReactElement =>
    user === undefined ? <Navigate replace to="/accedi" /> : schermata;

  return (
    <AppProvider value={state}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={riservata(<Home />)} />
          <Route path="cerca" element={riservata(<Cerca />)} />
          {/* Il proprio profilo non ha un indirizzo suo: è la propria pagina,
              e ha lo stesso indirizzo che vedono gli altri. */}
          <Route
            path="profilo"
            element={
              user === undefined ? (
                <Navigate replace to="/accedi" />
              ) : (
                <Navigate replace to={`/@${user.username}`} />
              )
            }
          />
          <Route path=":handle" element={riservata(<Profilo />)} />
          <Route path="impostazioni" element={riservata(<Impostazioni />)} />
          <Route path="impostazioni/dispositivi" element={riservata(<Devices />)} />
          <Route
            path="impostazioni/istanza"
            element={
              user?.role === "instance_admin" ? <Admin /> : <Navigate replace to="/accedi" />
            }
          />
        </Route>

        {/* I vecchi indirizzi restano validi: un segnalibro non deve rompersi
            perché l'interfaccia è cambiata. */}
        <Route path="/esplora" element={<Navigate replace to="/cerca" />} />
        <Route path="/dispositivi" element={<Navigate replace to="/impostazioni/dispositivi" />} />
        <Route path="/amministrazione" element={<Navigate replace to="/impostazioni/istanza" />} />

        <Route
          path="/accedi"
          element={user === undefined ? <Login /> : <Navigate replace to="/" />}
        />
        <Route path="/entra" element={<Join />} />
        <Route path="/recupera" element={<Recover />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </AppProvider>
  );
}
