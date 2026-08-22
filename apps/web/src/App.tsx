import type { AuthenticatedUser, InstancePublicView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "./api.js";
import { AppShell } from "./app/AppShell.js";
import {
  applicaPreferenze,
  marcaMigrazioneFatta,
  preferenzeDaServer,
  scriviPreferenzeLocali,
} from "./aspetto.js";
import { forgetLoadedMedia } from "./media.js";
import { leggiModo, scriviModo, type Modo } from "./modo.js";
import { Cerca } from "./screens/Cerca.js";
import { Home } from "./screens/Home.js";
import { Messaggi } from "./screens/Messaggi.js";
import { ModificaProfilo } from "./screens/ModificaProfilo.js";
import { Notifiche } from "./screens/Notifiche.js";
import { PostDetail } from "./screens/PostDetail.js";
import { Scrivi } from "./screens/Scrivi.js";
import { ImpostazioniLayout } from "./screens/impostazioni/Layout.js";
import { rottaDi, VOCI } from "./screens/impostazioni/registro.js";
import { Join } from "./screens/Join.js";
import { Login } from "./screens/Login.js";
import { Profilo } from "./screens/Profilo.js";
import { Recover } from "./screens/Recover.js";
import { Setup } from "./screens/Setup.js";
import { clearLocalDeviceIdentity, initializeDeviceIdentity } from "./dispositivo.js";
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
    applicaPreferenze(aggiornato.appearance);
    scriviPreferenzeLocali(aggiornato.appearance);
  }, []);

  useEffect(() => {
    applicaPreferenze();

    void (async () => {
      try {
        setInstance(await api.instance());

        const stored = loadSession();

        if (stored !== undefined) {
          try {
            // The stored token may have been revoked from another device.
            const me = await api.me(stored.token);
            const { daApplicare, daMigrare } = preferenzeDaServer(me.appearance);

            if (daMigrare !== undefined) {
              try {
                const salvato = await api.updateAppearance(stored.token, daMigrare);
                me.appearance = salvato;
                marcaMigrazioneFatta();
              } catch {
                // La migrazione può aspettare il prossimo ingresso.
              }
            }

            applicaPreferenze(daApplicare);
            scriviPreferenzeLocali(daApplicare);
            setUser({ ...me, appearance: daApplicare });
            setToken(stored.token);
            void initializeDeviceIdentity(stored.token).catch(() => {});
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
    const { daApplicare, daMigrare } = preferenzeDaServer(newUser.appearance);
    const utente = { ...newUser, appearance: daApplicare };

    storeSession({ token: newToken, user: utente });
    setToken(newToken);
    setUser(utente);
    applicaPreferenze(daApplicare);
    scriviPreferenzeLocali(daApplicare);
    void initializeDeviceIdentity(newToken).catch(() => {});

    if (daMigrare === undefined) {
      return;
    }

    void (async () => {
      try {
        const salvato = await api.updateAppearance(newToken, daMigrare);
        marcaMigrazioneFatta();
        const aggiornato = { ...utente, appearance: salvato };
        storeSession({ token: newToken, user: aggiornato });
        setUser(aggiornato);
        applicaPreferenze(salvato);
        scriviPreferenzeLocali(salvato);
      } catch {
        // Si resta sulla cache locale finché non si riesce a scrivere.
      }
    })();
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    void clearLocalDeviceIdentity().catch(() => {});
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
          <Route path="p/:instanceKey/:username/:id" element={riservata(<PostDetail />)} />
          <Route path="p/:id/c/:commentId" element={riservata(<PostDetail />)} />
          <Route
            path="p/:instanceKey/:username/:id/c/:commentId"
            element={riservata(<PostDetail />)}
          />
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
          <Route path="impostazioni" element={riservata(<ImpostazioniLayout />)}>
            {/* Le sezioni non si scrivono qui: escono dal registro, insieme
                alla nav e al filtro che le cerca. `soloAdmin` decide da solo
                che cosa va protetto — una voce non può essere di
                amministrazione nella lista e aperta nella rotta. */}
            {VOCI.map((voce) => {
              const Schermata = voce.componente;

              return (
                <Route
                  element={voce.soloAdmin === true ? amministra(<Schermata />) : <Schermata />}
                  key={voce.chiave}
                  path={rottaDi(voce)}
                />
              );
            })}

            {/* I nomi di prima, che restano validi. */}
            <Route path="profilo" element={<Navigate replace to="/modifica-profilo" />} />
            <Route path="istanza" element={<Navigate replace to="/impostazioni/informazioni" />} />
            <Route
              path="amministrazione/persone"
              element={<Navigate replace to="/impostazioni/amministrazione/inviti" />}
            />
            <Route
              path="amministrazione/rete"
              element={<Navigate replace to="/impostazioni/amministrazione/estianet" />}
            />
            <Route
              path="amministrazione/collegate"
              element={<Navigate replace to="/impostazioni/amministrazione/estianet" />}
            />
          </Route>
          <Route path=":handle" element={riservata(<Profilo />)} />
        </Route>

        {/* I vecchi indirizzi restano validi: un segnalibro non deve rompersi
            perché l'interfaccia è cambiata. */}
        <Route path="/esplora" element={<Navigate replace to="/cerca" />} />
        <Route path="/dispositivi" element={<Navigate replace to="/impostazioni/dispositivi" />} />
        <Route
          path="/amministrazione"
          element={<Navigate replace to="/impostazioni/amministrazione/inviti" />}
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
