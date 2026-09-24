import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api.js";
import { LinguaRapida } from "../components/LinguaRapida.js";
import { t } from "../i18n/index.js";
import { Alert, Button, TextField } from "../ui/index.js";

export function Recover(): React.ReactElement {
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
      setErrore(
        causa instanceof ApiError ? t("auth.recover.error_invalid") : t("auth.error_unreachable"),
      );
    } finally {
      setOccupato(false);
    }
  };

  if (esito !== undefined) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>{t("auth.recover.done.title")}</h1>
          <p>{t("auth.recover.done.body")}</p>

          <code className="secret">{esito.code}</code>

          <p className="muted">
            {esito.revoked > 0
              ? t("auth.recover.done.sessions_counted", { count: esito.revoked })
              : t("auth.recover.done.sessions")}
          </p>

          <Link className="btn btn--block" to="/accedi">
            {t("auth.recover.done.go")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>{t("auth.recover.title")}</h1>
        <p className="muted">{t("auth.recover.intro")}</p>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void recupera(event)}>
          <TextField
            autoFocus
            label={t("auth.recover.username")}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            required
            value={form.username}
          />
          <TextField
            hint={t("auth.recover.code_hint")}
            label={t("auth.recover.code")}
            onChange={(event) => setForm({ ...form, recoveryCode: event.target.value })}
            placeholder={t("auth.recover.code_placeholder")}
            required
            value={form.recoveryCode}
          />
          <TextField
            hint={t("auth.password_hint", { min: PASSWORD_MIN_LENGTH })}
            label={t("auth.recover.new_password")}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
            required
            type="password"
            value={form.newPassword}
          />
          <Button block disabled={occupato} type="submit">
            {occupato ? t("auth.recover.submitting") : t("auth.recover.submit")}
          </Button>
        </form>
      </div>

      <p className="muted center">
        <Link to="/accedi">{t("auth.recover.back")}</Link>
      </p>

      <LinguaRapida />
    </main>
  );
}
