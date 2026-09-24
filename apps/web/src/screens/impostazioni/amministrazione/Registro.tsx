import type { AuditEventView } from "@estia/contracts";
import type { PlainMessageKey } from "@estia/i18n";
import { useEffect, useState } from "react";

import { api } from "../../../api.js";
import { formatoData, t } from "../../../i18n/index.js";
import { useSignedIn } from "../../../state.js";
import { EmptyState } from "../../../ui/index.js";
import { Sezione } from "../Sezione.js";
import { titoloSezione } from "../sezioni.js";

/**
 * Il nome di ogni azione che l'istanza registra, per codice: chiavi del
 * catalogo `admin`, tradotte quando si disegna (ADR 0044). Un codice che questo
 * client non conosce ancora si mostra com'è.
 */
const ETICHETTE: Record<string, PlainMessageKey> = {
  invite_created: "admin.log.action.invite_created",
  invite_revoked: "admin.log.action.invite_revoked",
  join_request_rejected: "admin.log.action.join_request_rejected",
  member_admitted: "admin.log.action.member_admitted",
};

function etichetta(azione: string): string {
  const chiave = ETICHETTE[azione];

  return chiave === undefined ? azione : t(chiave);
}

function quando(valore: string): string {
  return formatoData(valore, { dateStyle: "medium", timeStyle: "short" });
}

export function Registro(): React.ReactElement {
  const { token } = useSignedIn();
  const [eventi, setEventi] = useState<AuditEventView[]>([]);

  useEffect(() => {
    void api.audit(token).then((risposta) => setEventi(risposta.events));
  }, [token]);

  return (
    <Sezione titolo={titoloSezione("registro")}>
      <div className="card card--flush">
        {eventi.length === 0 && (
          <EmptyState icon="instance" title={t("admin.log.empty.title")}>
            <p>{t("admin.log.empty.body")}</p>
          </EmptyState>
        )}
        {eventi.map((evento) => (
          <div className="row" key={evento.id}>
            <span className="row__body">
              <span className="row__title">
                {etichetta(evento.action)}
                {evento.action === "member_admitted" && <> · {evento.subject}</>}
              </span>
              <span className="row__note">
                {evento.actorUsername === null
                  ? quando(evento.createdAt)
                  : t("admin.log.by", {
                      name: evento.actorUsername,
                      when: quando(evento.createdAt),
                    })}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Sezione>
  );
}
