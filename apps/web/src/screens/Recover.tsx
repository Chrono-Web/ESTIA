import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api.js";
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
        causa instanceof ApiError
          ? "Nome utente o codice di recupero non validi."
          : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setOccupato(false);
    }
  };

  if (esito !== undefined) {
    return (
      <main className="column column--narrow stack">
        <div className="card">
          <h1>Password reimpostata</h1>
          <p>
            Il codice che hai usato è ora consumato. Questo è il suo sostituto, ed è di nuovo
            l&apos;unica volta in cui viene mostrato.
          </p>

          <code className="secret">{esito.code}</code>

          <p className="muted">
            Per sicurezza sono state chiuse tutte le sessioni aperte
            {esito.revoked > 0 ? ` (${String(esito.revoked)})` : ""}: dovrai rientrare su ogni
            dispositivo.
          </p>

          <Link className="btn btn--block" to="/accedi">
            Vai all&apos;accesso
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>Rientrare con il codice di recupero</h1>
        <p className="muted">
          È il codice che ti è stato mostrato alla creazione dell&apos;istanza, o dopo l&apos;ultimo
          recupero.
        </p>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void recupera(event)}>
          <TextField
            autoFocus
            label="Nome utente"
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            required
            value={form.username}
          />
          <TextField
            hint="Maiuscole, minuscole e trattini non contano: scrivilo come l'hai copiato."
            label="Codice di recupero"
            onChange={(event) => setForm({ ...form, recoveryCode: event.target.value })}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
            required
            value={form.recoveryCode}
          />
          <TextField
            hint={`Almeno ${String(PASSWORD_MIN_LENGTH)} caratteri.`}
            label="Nuova password"
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
            required
            type="password"
            value={form.newPassword}
          />
          <Button block disabled={occupato} type="submit">
            {occupato ? "Verifico…" : "Reimposta la password"}
          </Button>
        </form>
      </div>

      <p className="muted center">
        <Link to="/accedi">Torna all&apos;accesso</Link>
      </p>
    </main>
  );
}
