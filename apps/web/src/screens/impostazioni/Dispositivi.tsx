import type { SessionView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api.js";
import { useAvvisi } from "../../avvisi.js";
import { formatoData, t } from "../../i18n/index.js";
import { useSignedIn } from "../../state.js";
import { Badge, Button, Sheet } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { avvisoDiUscita } from "./chiavi-stato.js";
import { useChiavi } from "./useChiavi.js";

function quando(valore: string): string {
  return formatoData(valore, { dateStyle: "medium", timeStyle: "short" });
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
      mostraErrore(err, t("settings.devices.error_load"));
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
    <Sezione chiave="dispositivi" scopo={t("settings.devices.purpose")}>
      <div className="card card--flush">
        <h2 className="gruppo">{t("settings.devices.sessions.title")}</h2>
        {sessioni.length === 0 && (
          <p className="empty-inline">{t("settings.devices.sessions.empty")}</p>
        )}
        {sessioni.map((sessione) => (
          <div className="row" key={sessione.id}>
            <span className="row__body">
              <span className="row__title">
                {sessione.deviceLabel === ""
                  ? t("settings.devices.sessions.unnamed")
                  : sessione.deviceLabel}{" "}
                {sessione.current && (
                  <Badge tone="on">{t("settings.devices.sessions.current")}</Badge>
                )}
              </span>
              <span className="row__note">
                {t("settings.devices.sessions.dates", {
                  seen: quando(sessione.lastSeenAt),
                  since: quando(sessione.createdAt),
                })}
              </span>
            </span>
            <span className="row__end">
              <Button onClick={() => void revoca(sessione)} variant="danger">
                {sessione.current
                  ? t("settings.devices.sessions.sign_out_here")
                  : t("settings.devices.sessions.revoke")}
              </Button>
            </span>
          </div>
        ))}
        <p className="muted chiavi__testo" style={{ padding: "var(--s-3) var(--s-4)" }}>
          {t("settings.devices.sessions.revoke_note")}
        </p>
      </div>

      <div className="card">
        <h2 className="gruppo">{t("settings.devices.sign_out.title")}</h2>
        <p className="muted chiavi__testo">{avviso ?? t("settings.devices.sign_out.with_copy")}</p>
        <Button block onClick={chiediDiUscire} variant="secondary">
          {t("settings.devices.sign_out.button")}
        </Button>
      </div>

      <Sheet
        onClose={() => setConfermaUscita(false)}
        open={confermaUscita}
        title={t("settings.devices.sign_out.confirm.title")}
        variant="centrato"
      >
        <div className="feed-pad stack" style={{ paddingBlock: "var(--s-4)" }}>
          <p className="chiavi__testo">{avviso}</p>
          <Link className="btn btn--block" to="/impostazioni/chat">
            {t("settings.devices.sign_out.confirm.go_backup")}
          </Link>
          <Button block onClick={() => void esci()} variant="danger">
            {t("settings.devices.sign_out.confirm.anyway")}
          </Button>
        </div>
      </Sheet>
    </Sezione>
  );
}
