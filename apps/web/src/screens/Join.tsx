import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api.js";
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
          ? "Questo invito non è valido: potrebbe essere scaduto, già usato o ritirato."
          : causa instanceof ApiError && causa.code === "username_taken"
            ? "Questo nome utente è già preso. Scegline un altro."
            : causa instanceof ApiError
              ? causa.message
              : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setOccupato(false);
    }
  };

  if (inviata) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>Richiesta inviata</h1>
          <p>
            Hai chiesto di entrare in <strong>{nomeIstanza(instance)}</strong>. Ora tocca a chi
            amministra l&apos;istanza: quando ti approva, potrai entrare con il nome utente e la
            password che hai appena scelto.
          </p>
          <p className="muted">
            Avere un invito non basta per entrare: serve sempre che una persona ti apra la porta.
          </p>
          <Link className="btn btn--block btn--secondary" to="/accedi">
            Torna all&apos;accesso
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
        <p className="muted">
          {instance.memberCount === 1 ? "1 persona" : `${String(instance.memberCount)} persone`} in
          questa istanza.
        </p>
      </div>

      <div className="card">
        <h2>Chiedi di entrare</h2>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void chiedi(event)}>
          <TextField
            autoFocus={form.inviteCode.length === 0}
            label="Codice d'invito"
            onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
            value={form.inviteCode}
          />
          <TextField
            hint="Come vuoi essere chiamato. Puoi cambiarlo quando vuoi."
            label="Come ti chiami"
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder="Anna"
            value={form.displayName}
          />
          <TextField
            hint="Minuscolo, senza spazi. Questo non si cambia."
            label="Nome utente"
            onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
            pattern="[a-z0-9][a-z0-9_.\-]{1,30}[a-z0-9]"
            placeholder="anna"
            required
            value={form.username}
          />
          <TextField
            hint={`Almeno ${String(PASSWORD_MIN_LENGTH)} caratteri.`}
            label="Password"
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
            type="password"
            value={form.password}
          />
          <TextAreaField
            hint="Le legge chi deve decidere se farti entrare."
            label="Due righe su di te"
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            placeholder="Sono del secondo piano, scala B."
            rows={3}
            value={form.message}
          />

          <Button block disabled={occupato} type="submit">
            {occupato ? "Invio…" : "Chiedi di entrare"}
          </Button>
        </form>
      </div>
    </main>
  );
}
