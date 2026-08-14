import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api.js";

export function Recover(): React.ReactElement {
  const [form, setForm] = useState({ newPassword: "", recoveryCode: "", username: "" });
  const [result, setResult] = useState<{ code: string; revoked: number } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const done = await api.recover(form);
      setResult({ code: done.recoveryCode, revoked: done.revokedSessions });
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? "Nome utente o codice di recupero non validi."
          : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (result !== undefined) {
    return (
      <main className="narrow">
        <div className="card">
          <h1>Password reimpostata</h1>
          <p>
            Il codice che hai usato è ora consumato. Questo è il suo sostituto, ed è di nuovo
            l'unica volta in cui viene mostrato.
          </p>

          <code className="secret">{result.code}</code>

          <p className="muted">
            Per sicurezza sono state chiuse tutte le sessioni aperte
            {result.revoked > 0 ? ` (${result.revoked})` : ""}: dovrai rientrare su ogni
            dispositivo.
          </p>

          <Link to="/accedi">Vai all'accesso</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="narrow">
      <div className="card">
        <h1>Rientrare con il codice di recupero</h1>
        <p className="muted">
          È il codice che ti è stato mostrato alla creazione dell'istanza, o dopo l'ultimo recupero.
        </p>

        {error !== undefined && <div className="alert error">{error}</div>}

        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span className="label-text">Nome utente</span>
            <input
              autoFocus
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              required
              value={form.username}
            />
          </label>

          <label>
            <span className="label-text">Codice di recupero</span>
            <input
              onChange={(event) => setForm({ ...form, recoveryCode: event.target.value })}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
              required
              value={form.recoveryCode}
            />
            <span className="hint">
              Maiuscole, minuscole e trattini non contano: scrivilo come l'hai copiato.
            </span>
          </label>

          <label>
            <span className="label-text">Nuova password</span>
            <input
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              required
              type="password"
              value={form.newPassword}
            />
          </label>

          <button disabled={busy} type="submit">
            {busy ? "Verifico…" : "Reimposta la password"}
          </button>
        </form>
      </div>

      <p className="muted center">
        <Link to="/accedi">Torna all'accesso</Link>
      </p>
    </main>
  );
}
