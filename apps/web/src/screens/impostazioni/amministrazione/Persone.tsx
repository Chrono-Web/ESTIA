import type { JoinRequestView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { Avatar, Button, EmptyState } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Chi ha chiesto di entrare.
 *
 * Avere un invito non basta: serve sempre che una persona apra la porta
 * (PRODUCT_VISION §5.1), e questa è quella porta.
 */
export function Persone(): React.ReactElement {
  const { refreshInstance, token } = useSignedIn();
  const [richieste, setRichieste] = useState<JoinRequestView[]>([]);
  const [caricato, setCaricato] = useState(false);

  const carica = useCallback(async () => {
    setRichieste((await api.joinRequests(token)).requests);
    setCaricato(true);
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const decidi = async (richiesta: JoinRequestView, entra: boolean): Promise<void> => {
    await (entra ? api.approve(token, richiesta.id) : api.reject(token, richiesta.id));
    await Promise.all([carica(), refreshInstance()]);
  };

  return (
    <Sezione titolo="Chi entra">
      <div className="card card--flush">
        {caricato && richieste.length === 0 && (
          <EmptyState icon="users" title="Nessuna richiesta in attesa">
            <p>Quando qualcuno userà un invito, la sua richiesta comparirà qui.</p>
          </EmptyState>
        )}

        {richieste.map((richiesta) => (
          <div className="row" key={richiesta.id}>
            <Avatar displayName={richiesta.displayName} size="md" username={richiesta.username} />
            <span className="row__body">
              <span className="row__title">
                {richiesta.displayName === "" ? richiesta.username : richiesta.displayName}{" "}
                <span className="muted">@{richiesta.username}</span>
              </span>
              {richiesta.message !== "" && <span className="row__note">{richiesta.message}</span>}
              <span className="row__note">Ha chiesto il {quando(richiesta.createdAt)}</span>
            </span>
            <span className="row__end">
              <Button onClick={() => void decidi(richiesta, true)}>Fai entrare</Button>
              <Button onClick={() => void decidi(richiesta, false)} variant="danger">
                Rifiuta
              </Button>
            </span>
          </div>
        ))}
      </div>
    </Sezione>
  );
}
