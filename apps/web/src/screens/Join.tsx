import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api, ApiError } from "../api.js";
import { useApp } from "../state.js";

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
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      await api.join(form);
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "invalid_invite"
          ? "Questo invito non è valido: potrebbe essere scaduto, già usato o ritirato."
          : cause instanceof ApiError && cause.code === "username_taken"
            ? "Questo nome utente è già preso. Scegline un altro."
            : cause instanceof ApiError
              ? cause.message
              : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <main className="narrow">
        <div className="card">
          <h1>Richiesta inviata</h1>
          <p>
            Hai chiesto di entrare in <strong>{instance.name}</strong>. Ora tocca a chi amministra
            l'istanza: quando ti approva, potrai entrare con il nome utente e la password che hai
            appena scelto.
          </p>
          <p className="muted">
            Avere un invito non basta per entrare: serve sempre che una persona ti apra la porta.
          </p>
          <Link to="/accedi">Torna all'accesso</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="narrow">
      {/* The showcase: enough to know where you are asking to enter, and
          deliberately not the list of who is already inside. */}
      <div className="card">
        <h1>{instance.name}</h1>
        <p>{instance.description}</p>
        <p className="muted">
          {instance.memberCount === 1 ? "1 persona" : `${instance.memberCount} persone`} in questa
          istanza.
        </p>
      </div>

      <div className="card">
        <h2>Chiedi di entrare</h2>

        {error !== undefined && <div className="alert error">{error}</div>}

        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span className="label-text">Codice d'invito</span>
            <input
              autoFocus={form.inviteCode.length === 0}
              onChange={(event) => setForm({ ...form, inviteCode: event.target.value })}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              required
              value={form.inviteCode}
            />
          </label>

          <label>
            <span className="label-text">Come ti chiami</span>
            <input
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              placeholder="Anna"
              value={form.displayName}
            />
          </label>

          <label>
            <span className="label-text">Nome utente</span>
            <input
              onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })}
              pattern="[a-z0-9][a-z0-9_.\-]{1,30}[a-z0-9]"
              placeholder="anna"
              required
              value={form.username}
            />
          </label>

          <label>
            <span className="label-text">Password</span>
            <input
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
              type="password"
              value={form.password}
            />
            <span className="hint">Almeno {PASSWORD_MIN_LENGTH} caratteri.</span>
          </label>

          <label>
            <span className="label-text">Due righe su di te</span>
            <textarea
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder="Sono del secondo piano, scala B."
              value={form.message}
            />
            <span className="hint">Le legge chi deve decidere se farti entrare.</span>
          </label>

          <button disabled={busy} type="submit">
            {busy ? "Invio…" : "Chiedi di entrare"}
          </button>
        </form>
      </div>
    </main>
  );
}
