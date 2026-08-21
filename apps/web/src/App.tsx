import type { AuthenticatedUser, InstancePublicView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "./api.js";
import { AppShell } from "./app/AppShell.js";
import { forgetLoadedMedia } from "./media.js";
import { leggiModo, scriviModo, type Modo } from "./modo.js";
import { Cerca } from "./screens/Cerca.js";
import { Home } from "./screens/Home.js";
import { Messaggi } from "./screens/Messaggi.js";
import { ModificaProfilo } from "./screens/ModificaProfilo.js";
import { Notifiche } from "./screens/Notifiche.js";
import { PostDetail } from "./screens/PostDetail.js";
import { Scrivi } from "./screens/Scrivi.js";
import { Dispositivi } from "./screens/impostazioni/Dispositivi.js";
import { Impostazioni } from "./screens/impostazioni/Hub.js";
import { Informazioni } from "./screens/impostazioni/Informazioni.js";
import { Istanza } from "./screens/impostazioni/Istanza.js";
import { Presenza } from "./screens/impostazioni/Presenza.js";
import { Backup } from "./screens/impostazioni/amministrazione/Backup.js";
import { Collegate } from "./screens/impostazioni/amministrazione/Collegate.js";
import { Inviti } from "./screens/impostazioni/amministrazione/Inviti.js";
import { Persone } from "./screens/impostazioni/amministrazione/Persone.js";
import { Registro } from "./screens/impostazioni/amministrazione/Registro.js";
import { Rete } from "./screens/impostazioni/amministrazione/Rete.js";
import { Stato } from "./screens/impostazioni/amministrazione/Stato.js";
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

  const refreshUser = useCallback(async () => {
    const stored = loadSession();

    if (stored === undefined) {
      return;
    }

    const aggiornato = await api.me(stored.token);

    storeSession({ token: stored.token, user: aggiornato });
    setUser(aggiornato);
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
    return <p className="center">Un momento…</p>;
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

  const state = {
    instance,
    modo,
    refreshInstance,
    refreshUser,
    setModo,
    signIn,
    signOut,
    token,
    user,
  };

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

  /**
   * E una che non esiste per chi non amministra: torna all'hub e non
   * all'accesso, perché chi è qui una sessione ce l'ha — semplicemente quella
   * pagina non è sua.
   */
  const amministra = (schermata: React.ReactElement): React.ReactElement =>
    user?.role === "instance_admin" ? schermata : <Navigate replace to="/impostazioni" />;

  return (
    <AppProvider value={state}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={riservata(<Home />)} />
          <Route path="p/:id" element={riservata(<PostDetail />)} />
          <Route path="p/:id/c/:commentId" element={riservata(<PostDetail />)} />
          <Route path="cerca" element={riservata(<Cerca />)} />
          <Route path="scrivi" element={riservata(<Scrivi />)} />
          <Route path="messaggi" element={riservata(<Messaggi />)} />
          <Route path="notifiche" element={riservata(<Notifiche />)} />
          <Route path="modifica-profilo" element={riservata(<ModificaProfilo />)} />
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
          <Route path="r/:instanceKey/:username" element={riservata(<Profilo />)} />
          <Route path=":handle" element={riservata(<Profilo />)} />
          <Route path="impostazioni" element={riservata(<Impostazioni />)} />
          <Route
            path="impostazioni/profilo"
            element={<Navigate replace to="/modifica-profilo" />}
          />
          <Route path="impostazioni/presenza" element={riservata(<Presenza />)} />
          <Route path="impostazioni/dispositivi" element={riservata(<Dispositivi />)} />
          <Route path="impostazioni/istanza" element={riservata(<Istanza />)} />
          <Route path="impostazioni/informazioni" element={riservata(<Informazioni />)} />

          <Route path="impostazioni/amministrazione/persone" element={amministra(<Persone />)} />
          <Route path="impostazioni/amministrazione/inviti" element={amministra(<Inviti />)} />
          <Route
            path="impostazioni/amministrazione/collegate"
            element={amministra(<Collegate />)}
          />
          <Route path="impostazioni/amministrazione/rete" element={amministra(<Rete />)} />
          <Route path="impostazioni/amministrazione/backup" element={amministra(<Backup />)} />
          <Route path="impostazioni/amministrazione/stato" element={amministra(<Stato />)} />
          <Route path="impostazioni/amministrazione/registro" element={amministra(<Registro />)} />
        </Route>

        {/* I vecchi indirizzi restano validi: un segnalibro non deve rompersi
            perché l'interfaccia è cambiata. */}
        <Route path="/esplora" element={<Navigate replace to="/cerca" />} />
        <Route path="/dispositivi" element={<Navigate replace to="/impostazioni/dispositivi" />} />
        <Route
          path="/amministrazione"
          element={<Navigate replace to="/impostazioni/amministrazione/persone" />}
        />

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
