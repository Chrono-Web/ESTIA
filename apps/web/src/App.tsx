import type { AuthenticatedUser, InstancePublicView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "./api.js";
import { Shell } from "./components/Shell.js";
import { Admin } from "./screens/Admin.js";
import { Devices } from "./screens/Devices.js";
import { Home } from "./screens/Home.js";
import { Join } from "./screens/Join.js";
import { Login } from "./screens/Login.js";
import { Recover } from "./screens/Recover.js";
import { Setup } from "./screens/Setup.js";
import { clearSession, loadSession, storeSession } from "./session.js";
import { AppProvider } from "./state.js";

export function App(): React.ReactElement {
  const [instance, setInstance] = useState<InstancePublicView | undefined>();
  const [user, setUser] = useState<AuthenticatedUser | undefined>();
  const [token, setToken] = useState<string | undefined>();
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
    setToken(undefined);
    setUser(undefined);
  }, []);

  if (!ready) {
    return <p className="centered">Un momento…</p>;
  }

  if (failure !== undefined || instance === undefined) {
    return (
      <main className="narrow">
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

  // Nothing else is reachable until someone has claimed this instance.
  if (instance.state === "unconfigured") {
    return (
      <AppProvider value={{ instance, refreshInstance, signIn, signOut, token, user }}>
        <Setup />
      </AppProvider>
    );
  }

  return (
    <AppProvider value={{ instance, refreshInstance, signIn, signOut, token, user }}>
      <Routes>
        <Route element={<Shell />}>
          <Route
            index
            element={user === undefined ? <Navigate replace to="/accedi" /> : <Home />}
          />
          <Route
            path="dispositivi"
            element={user === undefined ? <Navigate replace to="/accedi" /> : <Devices />}
          />
          <Route
            path="amministrazione"
            element={
              user?.role === "instance_admin" ? <Admin /> : <Navigate replace to="/accedi" />
            }
          />
        </Route>
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
