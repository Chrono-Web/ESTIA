import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api.js";
import { LinguaRapida } from "../components/LinguaRapida.js";
import { spiega } from "../errori.js";
import { T, t } from "../i18n/index.js";
import { nomeIstanza, useApp } from "../state.js";
import { Alert, Button, TextAreaField, TextField } from "../ui/index.js";

/**
 * Chiedere di entrare.
 *
 * Resta un modulo unico, e non una procedura a passi come la configurazione: il
 * budget di PRODUCT_VISION §4 dice «dal tap sul link d'invito al feed popolato,
 * meno di tre minuti», e spezzare in schermate un modulo corto lo allunga. I
 * passi servono a chi amministra, che ha sei decisioni da prendere; qui ce ne
 * sono zero.
 */
export function Join(): React.ReactElement {
  const { instance } = useApp();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    displayName: "",
    inviteCode: params.get("codice") ?? "",
    message: "",
    password: "",
    username: "",
  });
  const [inviata, setInviata] = useState(false);
  const [errore, setErrore] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const chiedi = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setOccupato(true);
    setErrore(undefined);

    try {
      await api.join(form);
      setInviata(true);
    } catch (causa) {
      setErrore(
        causa instanceof ApiError && causa.code === "invalid_invite"
          ? t("auth.join.error_invalid_invite")
          : causa instanceof ApiError && causa.code === "username_taken"
            ? t("auth.join.error_username_taken")
            : causa instanceof ApiError
              ? spiega(causa, causa.message)
              : t("auth.error_unreachable"),
      );
    } finally {
      setOccupato(false);
    }
  };

  if (inviata) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>{t("auth.join.sent.title")}</h1>
          <p>
            <T k="auth.join.sent.body" params={{ instance: nomeIstanza(instance) }} />
          </p>
          <p className="muted">{t("auth.join.sent.note")}</p>
          <Link className="btn btn--block btn--secondary" to="/accedi">
            {t("auth.join.sent.back")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="column column--narrow stack">
      {/* La vetrina: quanto basta a sapere dove stai chiedendo di entrare, e
          deliberatamente non l'elenco di chi c'è già dentro. */}
      <div className="card">
        <h1>{nomeIstanza(instance)}</h1>
        {instance.description !== undefined && instance.description !== "" && (
          <p>{instance.description}</p>
        )}
        <p className="muted">{t("auth.join.members", { count: instance.memberCount })}</p>
      </div>

      <div className="card">
        <h2>{t("auth.join.title")}</h2>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void chiedi(event)}>
          <TextField
            autoFocus={form.inviteCode.length === 0}
            label={t("auth.join.invite_code")}
            onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
            placeholder={t("auth.join.invite_code_placeholder")}
            required
            value={form.inviteCode}
          />
          <TextField
            hint={t("auth.join.display_name_hint")}
            label={t("auth.join.display_name")}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder={t("auth.join.display_name_placeholder")}
            value={form.displayName}
          />
          <TextField
            hint={t("auth.join.username_hint")}
            label={t("auth.join.username")}
            onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
            pattern="[a-z0-9][a-z0-9_.\-]{1,30}[a-z0-9]"
            placeholder={t("auth.join.username_placeholder")}
            required
            value={form.username}
          />
          <TextField
            hint={t("auth.password_hint", { min: PASSWORD_MIN_LENGTH })}
            label={t("auth.join.password")}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
            type="password"
            value={form.password}
          />
          <TextAreaField
            hint={t("auth.join.message_hint")}
            label={t("auth.join.message")}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            placeholder={t("auth.join.message_placeholder")}
            rows={3}
            value={form.message}
          />

          <Button block disabled={occupato} type="submit">
            {occupato ? t("auth.join.submitting") : t("auth.join.submit")}
          </Button>
        </form>
      </div>

      <LinguaRapida />
    </main>
  );
}
