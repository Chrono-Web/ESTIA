import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api.js";
import { spiega } from "../errori.js";
import { useT } from "../lingua.js";
import { Alert, Button, TextField } from "../ui/index.js";

export function Recover(): React.ReactElement {
  const { t, tn } = useT();
  const [form, setForm] = useState({ newPassword: "", recoveryCode: "", username: "" });
  const [esito, setEsito] = useState<{ code: string; revoked: number } | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const recupera = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setOccupato(true);
    setErrore(undefined);

    try {
      const fatto = await api.recover(form);

      setEsito({ code: fatto.recoveryCode, revoked: fatto.revokedSessions });
    } catch (causa) {
      setErrore(spiega(causa, t("comune.istanza_irraggiungibile")));
    } finally {
      setOccupato(false);
    }
  };

  if (esito !== undefined) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>{t("recupero.fatto.titolo")}</h1>
          <p>{t("recupero.fatto.testo")}</p>

          <code className="secret">{esito.code}</code>

          {esito.revoked > 0 && (
            <p className="muted">{tn("recupero.fatto.sessioni", esito.revoked)}</p>
          )}

          <Link className="btn btn--block" to="/accedi">
            {t("recupero.vai_accesso")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>{t("recupero.titolo")}</h1>
        <p className="muted">{t("recupero.intro")}</p>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void recupera(event)}>
          <TextField
            autoFocus
            label={t("comune.nome_utente")}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            required
            value={form.username}
          />
          <TextField
            hint={t("recupero.codice.aiuto")}
            label={t("recupero.codice.etichetta")}
            onChange={(event) => setForm({ ...form, recoveryCode: event.target.value })}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            required
            value={form.recoveryCode}
          />
          <TextField
            hint={t("comune.password_minimo", { n: PASSWORD_MIN_LENGTH })}
            label={t("recupero.nuova_password")}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
            required
            type="password"
            value={form.newPassword}
          />
          <Button block disabled={occupato} type="submit">
            {occupato ? t("recupero.verifico") : t("recupero.reimposta")}
          </Button>
        </form>
      </div>

      <p className="muted center">
        <Link to="/accedi">{t("entrare.torna")}</Link>
      </p>
    </main>
  );
}
