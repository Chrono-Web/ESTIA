import type { SessionView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";

function when(value: string): string {
  return new Date(value).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Devices(): React.ReactElement {
  const { signOut, token } = useSignedIn();
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(async () => {
    try {
      setSessions((await api.sessions(token)).sessions);
    } catch {
      setError("Non riesco a leggere l'elenco dei dispositivi.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (session: SessionView): Promise<void> => {
    await api.revokeSession(token, session.id);

    // Revoking your own session ends it right here, with no pretending.
    if (session.current) {
      signOut();
      return;
    }

    await load();
  };

  return (
    <main>
      <div className="card">
        <h1>Dispositivi collegati</h1>
        <p className="muted">
          Ogni accesso è un dispositivo. Revocarne uno lo disconnette subito, ovunque si trovi.
        </p>

        {error !== undefined && <div className="alert error">{error}</div>}

        {sessions.length === 0 && <p className="empty">Nessun dispositivo collegato.</p>}

        {sessions.map((session) => (
          <div className="row" key={session.id}>
            <div className="grow">
              <strong>{session.deviceLabel === "" ? "Dispositivo" : session.deviceLabel}</strong>{" "}
              {session.current && <span className="badge on">questo</span>}
              <div className="muted">
                Collegato il {when(session.createdAt)} · visto {when(session.lastSeenAt)}
              </div>
            </div>
            <button className="danger" onClick={() => void revoke(session)} type="button">
              {session.current ? "Esci da qui" : "Revoca"}
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
