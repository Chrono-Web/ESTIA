import type { AuditEventView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../../api.js";
import { useSignedIn } from "../../../state.js";
import { EmptyState } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";

const ETICHETTE: Record<string, string> = {
  invite_created: "Invito creato",
  invite_revoked: "Invito ritirato",
  join_request_rejected: "Richiesta rifiutata",
  member_admitted: "Persona ammessa",
};

function quando(valore: string): string {
  return new Date(valore).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export function Registro(): React.ReactElement {
  const { token } = useSignedIn();
  const [eventi, setEventi] = useState<AuditEventView[]>([]);

  useEffect(() => {
    void api.audit(token).then((risposta) => setEventi(risposta.events));
  }, [token]);

  return (
    <Sezione titolo="Registro">
      <div className="card card--flush">
        {eventi.length === 0 && (
          <EmptyState icon="instance" title="Ancora nulla da mostrare">
            <p>Qui finisce quello che viene deciso: chi entra, e quali inviti nascono e muoiono.</p>
          </EmptyState>
        )}
        {eventi.map((evento) => (
          <div className="row" key={evento.id}>
            <span className="row__body">
              <span className="row__title">
                {ETICHETTE[evento.action] ?? evento.action}
                {evento.action === "member_admitted" && <> · {evento.subject}</>}
              </span>
              <span className="row__note">
                {quando(evento.createdAt)}
                {evento.actorUsername !== null && ` · da ${evento.actorUsername}`}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Sezione>
  );
}
