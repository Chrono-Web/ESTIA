import type { ConnectionView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../api.js";
import { T, t } from "../../i18n/index.js";
import { nomeIstanza, useSignedIn } from "../../state.js";
import { Alert } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { titoloSezione } from "./sezioni.js";

/**
 * Questa casa e questo software.
 *
 * Comprende ciò che prima stava in «L'istanza»: chi ci abita e da dove stai
 * arrivando adesso (SECURITY_BASELINE §1). La chiave per collegare altre
 * istanze non sta qui — sta in EstiaNet, dove serve.
 */
export function Informazioni(): React.ReactElement {
  const { instance } = useSignedIn();
  const [connessione, setConnessione] = useState<ConnectionView | undefined>();

  useEffect(() => {
    void api
      .connection()
      .then(setConnessione)
      .catch(() => undefined);
  }, []);

  return (
    <Sezione titolo={titoloSezione("informazioni")}>
      <div className="card">
        <h2>{nomeIstanza(instance)}</h2>
        {instance.description !== undefined && instance.description !== "" && (
          <p>{instance.description}</p>
        )}
        <p className="muted">{t("settings.info.members", { count: instance.memberCount })}</p>
      </div>

      <div className="card">
        <h2>{t("settings.info.connection.title")}</h2>
        {connessione === undefined ? (
          <p className="muted">{t("settings.info.connection.checking")}</p>
        ) : connessione.origin === "public" ? (
          <Alert tone="error">{connessione.detail}</Alert>
        ) : (
          <p className="muted">{connessione.detail}</p>
        )}
      </div>

      <div className="card">
        <h2>{t("settings.info.about.title")}</h2>
        <p>{t("settings.info.about.body")}</p>
        <p className="muted">{t("settings.info.about.local")}</p>
      </div>

      <div className="card">
        <h2>{t("settings.info.licence.title")}</h2>
        <p className="muted">
          <T k="settings.info.licence.body" />
        </p>
      </div>
    </Sezione>
  );
}
