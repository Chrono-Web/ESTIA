import type { SessionView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api.js";
import { useAvvisi } from "../../avvisi.js";
import { useSignedIn } from "../../state.js";
import { Badge, Button, Sheet } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { avvisoDiUscita } from "./chiavi-stato.js";
import { useChiavi } from "./useChiavi.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Da dove sei entrato, e come si esce.
 *
 * Un lavoro solo (euristica 8): le chiavi delle chat stanno in **Chat**, che è
 * dove si governano. Qui restano perché uscire le porta via, e un pulsante che
 * cancella deve poterlo dire — ma la copia si fa di là, e il link ci porta.
 */
export function Dispositivi(): React.ReactElement {
  const { signOut, token } = useSignedIn();
  const { errore: mostraErrore } = useAvvisi();
  const [sessioni, setSessioni] = useState<SessionView[]>([]);
  const [confermaUscita, setConfermaUscita] = useState(false);
  const { stato } = useChiavi(token);

  const avviso = avvisoDiUscita(stato);

  const carica = useCallback(async () => {
    try {
      setSessioni((await api.sessions(token)).sessions);
    } catch (err: unknown) {
      mostraErrore(err, "Non riesco a leggere l'elenco dei dispositivi.");
    }
  }, [mostraErrore, token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const esci = async (): Promise<void> => {
    setConfermaUscita(false);
    try {
      await api.logout(token);
    } catch {
      // La sessione può essere già finita: lo stato locale si pulisce comunque.
    }

    signOut();
  };

  const chiediDiUscire = (): void => {
    if (avviso === undefined) {
      void esci();
      return;
    }
    setConfermaUscita(true);
  };

  const revoca = async (sessione: SessionView): Promise<void> => {
    // Uscire da qui porta via le chiavi: si passa dalla stessa domanda.
    if (sessione.current) {
      chiediDiUscire();
      return;
    }

    await api.revokeSession(token, sessione.id);
    await carica();
  };

  return (
    <Sezione titolo="Accesso e dispositivi">
      <div className="card card--flush">
        <h2 className="gruppo">Da dove sei entrato</h2>
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
                {sessione.current ? "Esci da qui" : "Disconnetti"}
              </Button>
            </span>
          </div>
        ))}
        <p className="muted chiavi__testo" style={{ padding: "var(--s-3) var(--s-4)" }}>
          Disconnettere un dispositivo lo butta fuori subito, ovunque si trovi: nessuna attesa e
          nessuna scadenza da aspettare.
        </p>
      </div>

      <div className="card">
        <h2 className="gruppo">Uscire</h2>
        <p className="muted chiavi__testo">
          {avviso ??
            "Uscendo, le chiavi delle chat spariscono da questo browser. Ne esiste una copia, quindi potrai rimetterle rientrando con la tua frase segreta."}
        </p>
        <Button block onClick={chiediDiUscire} variant="secondary">
          Esci da questo dispositivo
        </Button>
      </div>

      <Sheet
        onClose={() => setConfermaUscita(false)}
        open={confermaUscita}
        title="Uscire senza una copia?"
        variant="centrato"
      >
        <div className="feed-pad stack" style={{ paddingBlock: "var(--s-4)" }}>
          <p className="chiavi__testo">{avviso}</p>
          <Link className="btn btn--block" to="/impostazioni/chat">
            Portami a creare la copia
          </Link>
          <Button block onClick={() => void esci()} variant="danger">
            Esci lo stesso, e perdi i messaggi
          </Button>
        </div>
      </Sheet>
    </Sezione>
  );
}
