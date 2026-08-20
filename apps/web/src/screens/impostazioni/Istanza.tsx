import type { ConnectionView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../api.js";
import { nomeIstanza, useSignedIn } from "../../state.js";
import { Alert } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * L'istanza, per chi ci abita.
 *
 * Compresa la cosa che chi amministra vede nella diagnostica e chi entra non ha
 * mai visto: **da dove sta arrivando adesso**. SECURITY_BASELINE §1 mette il
 * trasporto remoto fra i confini di fiducia, e dichiararlo in un documento non
 * è dichiararlo — chi attraversa quel confine i documenti non li legge.
 */
export function Istanza(): React.ReactElement {
  const { instance } = useSignedIn();
  const [connessione, setConnessione] = useState<ConnectionView | undefined>();

  useEffect(() => {
    void api
      .connection()
      .then(setConnessione)
      .catch(() => undefined);
  }, []);

  return (
    <Sezione titolo="L'istanza">
      <div className="card">
        <h2>{nomeIstanza(instance)}</h2>
        {instance.description !== undefined && instance.description !== "" && (
          <p>{instance.description}</p>
        )}
        <p className="muted">
          {instance.memberCount === 1 ? "1 persona" : `${String(instance.memberCount)} persone`} in
          questa istanza.
        </p>
      </div>

      <div className="card">
        <h2>Come sei connesso</h2>
        {connessione === undefined ? (
          <p className="muted">Sto guardando…</p>
        ) : connessione.origin === "public" ? (
          <Alert tone="error">{connessione.detail}</Alert>
        ) : (
          <p className="muted">{connessione.detail}</p>
        )}
      </div>

      <div className="card">
        <h2>La chiave di questa istanza</h2>
        <p className="muted">
          È il modo in cui questa istanza si fa riconoscere, e non cambia mai: resta la stessa dopo
          un riavvio, dopo un aggiornamento e dopo un ripristino da backup. Non contiene dove si
          trova.
        </p>
        <code className="secret">{instance.publicKey}</code>
      </div>
    </Sezione>
  );
}
