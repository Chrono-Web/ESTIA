import type { SessionView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../api.js";
import { useSignedIn } from "../../state.js";
import { Alert, Badge, Button } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Dispositivi(): React.ReactElement {
  const { signOut, token } = useSignedIn();
  const [sessioni, setSessioni] = useState<SessionView[]>([]);
  const [errore, setErrore] = useState<string | undefined>();

  const carica = useCallback(async () => {
    try {
      setSessioni((await api.sessions(token)).sessions);
    } catch {
      setErrore("Non riesco a leggere l'elenco dei dispositivi.");
    }
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const revoca = async (sessione: SessionView): Promise<void> => {
    await api.revokeSession(token, sessione.id);

    // Revocare la propria sessione finisce qui, senza far finta di niente.
    if (sessione.current) {
      signOut();
      return;
    }

    await carica();
  };

  const esci = async (): Promise<void> => {
    try {
      await api.logout(token);
    } catch {
      // La sessione può essere già finita: lo stato locale si pulisce comunque.
    }

    signOut();
  };

  return (
    <Sezione titolo="Accesso e dispositivi">
      {errore !== undefined && <Alert tone="error">{errore}</Alert>}

      <div className="card card--flush">
        <h2 className="gruppo">Dispositivi collegati</h2>
        {sessioni.length === 0 && <p className="empty-inline">Nessun dispositivo collegato.</p>}
        {sessioni.map((sessione) => (
          <div className="row" key={sessione.id}>
            <span className="row__body">
              <span className="row__title">
                {sessione.deviceLabel === "" ? "Dispositivo" : sessione.deviceLabel}{" "}
                {sessione.current && <Badge tone="on">questo</Badge>}
              </span>
              <span className="row__note">
                Collegato il {quando(sessione.createdAt)} · visto {quando(sessione.lastSeenAt)}
              </span>
            </span>
            <span className="row__end">
              <Button onClick={() => void revoca(sessione)} variant="danger">
                {sessione.current ? "Esci da qui" : "Revoca"}
              </Button>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <p className="muted">
          Revocare un dispositivo lo disconnette subito, ovunque si trovi: non c&apos;è nessuna
          attesa e nessuna scadenza da aspettare.
        </p>
        <Button block onClick={() => void esci()} variant="secondary">
          Esci da questo dispositivo
        </Button>
      </div>
    </Sezione>
  );
}
