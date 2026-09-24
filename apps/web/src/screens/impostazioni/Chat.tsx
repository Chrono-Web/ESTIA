import { useState } from "react";

import { api } from "../../api.js";
import { useAvvisi } from "../../avvisi.js";
import { formatoData, T, t } from "../../i18n/index.js";
import { ripristina, salvaCopia as salvaCopiaMls } from "../../mls/motore.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, TextField } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";
import { codiceDi } from "./codice-dispositivo.js";
import { comeFunzionano, piuDispositivi, raccontoDi } from "./chiavi-stato.js";
import { useChiavi } from "./useChiavi.js";

function quando(valore: string): string {
  return formatoData(valore, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Le chat: le chiavi, la copia che le riporta altrove, e chi può leggerle.
 *
 * Sta separata da «Accesso e dispositivi» perché sono due lavori diversi — là
 * si guarda da dove si è entrati e si esce, qui si governa che cosa può leggere
 * i propri messaggi (euristica 8: una sezione, un lavoro).
 *
 * **Qui arrivano le richieste di autorizzazione di un dispositivo nuovo**
 * ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md),
 * strada B): a dire di sì è un dispositivo che già possiedi, e il codice da
 * confrontare lo calcola **questo browser** dalla chiave pubblica — se lo
 * fornisse l'istanza, l'istanza potrebbe mostrarne uno che coincide anche dopo
 * aver sostituito la chiave.
 *
 * Che cosa il sì fa: mette il dispositivo nel registro, e da lì il dispositivo
 * entra da solo in ciascuna conversazione la prima volta che la apre — un
 * rientro dal punto pubblicato, un commit MLS per conversazione. Gli altri
 * dispositivi restano accesi, ed è quello che dice l'avviso in cima.
 */
export function Chat(): React.ReactElement {
  const { token, user } = useSignedIn();
  const { errore: mostraErrore, successo: mostraSuccesso } = useAvvisi();
  const { copiaEsiste, daAutorizzare, ilMioCodice, inLettura, ricarica, stato } = useChiavi(token);
  const [fraseSegreta, setFraseSegreta] = useState("");
  const [inLavorazione, setInLavorazione] = useState(false);

  const racconto = raccontoDi(stato);

  const salvaCopia = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (fraseSegreta.trim().length < 8) {
      mostraErrore(null, t("settings.chat.backup.error_passphrase_short"));
      return;
    }
    setInLavorazione(true);
    try {
      await salvaCopiaMls(token, fraseSegreta);
      setFraseSegreta("");
      mostraSuccesso(t("settings.chat.backup.created"));
      await ricarica();
    } catch (err: unknown) {
      mostraErrore(err, t("settings.chat.backup.error_create"));
    } finally {
      setInLavorazione(false);
    }
  };

  const decidi = async (deviceId: string, si: boolean): Promise<void> => {
    setInLavorazione(true);
    try {
      if (si) {
        await api.approvaDispositivo(token, deviceId);
        mostraSuccesso(t("settings.chat.requests.approved"));
      } else {
        await api.rifiutaDispositivo(token, deviceId);
        mostraSuccesso(t("settings.chat.requests.declined"));
      }
      await ricarica();
    } catch (err: unknown) {
      mostraErrore(err, t("settings.chat.requests.error"));
    } finally {
      setInLavorazione(false);
    }
  };

  const rimettiLeChiavi = async (): Promise<void> => {
    if (fraseSegreta.trim().length === 0) {
      mostraErrore(null, t("settings.chat.backup.error_passphrase_empty"));
      return;
    }
    setInLavorazione(true);
    try {
      await ripristina(token, user.username, fraseSegreta);
      setFraseSegreta("");
      mostraSuccesso(t("settings.chat.backup.restored"));
      await ricarica();
    } catch (err: unknown) {
      mostraErrore(err, t("settings.chat.backup.error_open"));
    } finally {
      setInLavorazione(false);
    }
  };

  return (
    <Sezione chiave="chat" scopo={t("settings.chat.purpose")}>
      <Alert tone="neutral">
        <p className="chiavi__testo">{piuDispositivi()}</p>
      </Alert>

      {daAutorizzare.length > 0 && (
        <div className="card stack">
          <h2 className="gruppo">
            {t("settings.chat.requests.title", { count: daAutorizzare.length })}
          </h2>
          <p className="muted chiavi__testo">
            <T k="settings.chat.requests.check" />
          </p>
          {daAutorizzare.map((dispositivo) => (
            <div className="richiesta" key={dispositivo.id}>
              <p className="richiesta__codice">{codiceDi(dispositivo.publicKey)}</p>
              <p className="muted chiavi__testo">
                {t("settings.chat.requests.since", { date: quando(dispositivo.createdAt) })}
              </p>
              <div className="cluster">
                <Button
                  disabled={inLavorazione}
                  onClick={() => void decidi(dispositivo.id, true)}
                  variant="primary"
                >
                  {t("settings.chat.requests.approve")}
                </Button>
                <Button
                  disabled={inLavorazione}
                  onClick={() => void decidi(dispositivo.id, false)}
                  variant="danger"
                >
                  {t("settings.chat.requests.decline")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ilMioCodice !== undefined && (
        <div className="card stack">
          <h2 className="gruppo">{t("settings.chat.mine.title")}</h2>
          <p className="richiesta__codice">{ilMioCodice}</p>
          <p className="muted chiavi__testo">{t("settings.chat.mine.compare")}</p>
        </div>
      )}

      <div className="card stack">
        <h2 className="gruppo">{t("settings.chat.keys.title")}</h2>
        {inLettura ? (
          <p className="empty-inline">{t("common.loading")}</p>
        ) : (
          <Alert tone={racconto.tono}>
            <div className="stack stack--tight">
              <strong>{racconto.titolo}</strong>
              <p className="chiavi__testo">{racconto.testo}</p>
              {racconto.cosaFare !== undefined && (
                <p className="chiavi__testo">{racconto.cosaFare}</p>
              )}
            </div>
          </Alert>
        )}
        <p className="muted chiavi__testo">{comeFunzionano()}</p>
      </div>

      <div className="card">
        <h2 className="gruppo">{t("settings.chat.backup.title")}</h2>
        <p className="muted chiavi__testo">
          <T k="settings.chat.backup.intro" />
        </p>
        <form onSubmit={(e) => void salvaCopia(e)}>
          <TextField
            hint={t("settings.chat.backup.passphrase_hint")}
            label={t("settings.chat.backup.passphrase")}
            onChange={(e) => setFraseSegreta(e.target.value)}
            placeholder={t("settings.chat.backup.passphrase_placeholder")}
            type="password"
            value={fraseSegreta}
          />
          <div className="button-group">
            <Button
              disabled={inLavorazione || fraseSegreta.length < 8}
              type="submit"
              variant="primary"
            >
              {inLavorazione
                ? t("common.loading")
                : copiaEsiste
                  ? t("settings.chat.backup.update")
                  : t("settings.chat.backup.create")}
            </Button>
            {copiaEsiste && (
              <Button
                disabled={inLavorazione || fraseSegreta.length === 0}
                onClick={() => void rimettiLeChiavi()}
                type="button"
                variant="secondary"
              >
                {t("settings.chat.backup.restore")}
              </Button>
            )}
          </div>
        </form>
      </div>
    </Sezione>
  );
}
