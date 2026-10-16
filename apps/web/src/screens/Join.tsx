import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api.js";
import { spiega } from "../errori.js";
import { useT } from "../lingua.js";
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
  const { t, tn, tc } = useT();
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
      setErrore(spiega(causa, t("comune.istanza_irraggiungibile")));
    } finally {
      setOccupato(false);
    }
  };

  if (inviata) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>{t("entrare.inviata.titolo")}</h1>
          <p>
            {tc("entrare.inviata.testo", { istanza: <strong>{nomeIstanza(instance)}</strong> })}
          </p>
          <p className="muted">{t("entrare.inviata.porta")}</p>
          <Link className="btn btn--block btn--secondary" to="/accedi">
            {t("entrare.torna")}
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
        <p className="muted">{tn("entrare.persone", instance.memberCount)}</p>
      </div>

      <div className="card">
        <h2>{t("accesso.chiedi_di_entrare")}</h2>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void chiedi(event)}>
          <TextField
            autoFocus={form.inviteCode.length === 0}
            label={t("entrare.codice")}
            onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
            value={form.inviteCode}
          />
          <TextField
            hint={t("entrare.nome.aiuto")}
            label={t("entrare.nome.etichetta")}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder={t("entrare.nome.esempio")}
            value={form.displayName}
          />
          <TextField
            hint={t("entrare.utente.aiuto")}
            label={t("comune.nome_utente")}
            onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
            pattern="[a-z0-9][a-z0-9_.\-]{1,30}[a-z0-9]"
            placeholder={t("entrare.utente.esempio")}
            required
            value={form.username}
          />
          <TextField
            hint={t("comune.password_minimo", { n: PASSWORD_MIN_LENGTH })}
            label={t("comune.password")}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
            type="password"
            value={form.password}
          />
          <TextAreaField
            hint={t("entrare.messaggio.aiuto")}
            label={t("entrare.messaggio.etichetta")}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            placeholder={t("entrare.messaggio.esempio")}
            rows={3}
            value={form.message}
          />

          <Button block disabled={occupato} type="submit">
            {occupato ? t("entrare.invio") : t("accesso.chiedi_di_entrare")}
          </Button>
        </form>
      </div>
    </main>
  );
}
