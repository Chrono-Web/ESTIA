import { PASSWORD_MIN_LENGTH } from "@estia/contracts";
import { useState } from "react";

import { api, ApiError } from "../api.js";
import { useApp } from "../state.js";

export function Setup(): React.ReactElement {
  const { instance, refreshInstance } = useApp();
  const [form, setForm] = useState({
    adminPassword: "",
    adminUsername: "",
    description: "",
    name: "",
    setupToken: "",
  });
  const [recoveryCode, setRecoveryCode] = useState<string | undefined>();
  const [written, setWritten] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const created = await api.setup({
        adminPassword: form.adminPassword,
        adminUsername: form.adminUsername,
        description: form.description,
        name: form.name,
        setupToken: form.setupToken,
      });

      setRecoveryCode(created.recoveryCode);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "invalid_setup_token"
          ? "Il codice di configurazione non è valido. È quello stampato nella console dell'istanza, e cambia a ogni riavvio."
          : cause instanceof ApiError
            ? cause.message
            : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCode !== undefined) {
    return (
      <main className="narrow">
        <div className="card">
          <h1>Scrivi questo codice, adesso</h1>
          <p>
            È il codice di recupero della tua istanza. Serve a rientrare se dimentichi la password,
            ed è <strong>l'unica volta</strong> in cui viene mostrato: l'istanza ne conserva solo
            un'impronta, e non può più mostrartelo.
          </p>

          <code className="secret">{recoveryCode}</code>

          <p className="muted">
            Copialo su un foglio, in un gestore di password, su una chiavetta — dove preferisci,
            purché non sia solo su questo computer. Se perdi il codice <em>e</em> la password,
            l'istanza non è più recuperabile da nessuno.
          </p>

          <label>
            <input
              checked={written}
              onChange={(event) => setWritten(event.target.checked)}
              type="checkbox"
            />{" "}
            L'ho scritto in un posto sicuro
          </label>

          <button disabled={!written} onClick={() => void refreshInstance()} type="button">
            Entra nell'istanza
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="narrow">
      <div className="card">
        <h1>Diamo un nome a questa istanza</h1>
        <p className="muted">
          Stai configurando ESTIA per la prima volta. Da qui nascono il quartiere e il suo
          amministratore.
        </p>

        {/* Detto prima che qualcuno ci metta dentro le fotografie di un
            quartiere, non dopo averle perse: un'istanza i cui dati stanno nel
            container si azzera al primo aggiornamento. */}
        {instance.dataDurability === "ephemeral" && (
          <div className="alert error">
            <strong>Fermati un momento.</strong> I dati di questa istanza non stanno su un volume,
            ma dentro il container: al primo aggiornamento dell'immagine spariranno tutti, compresa
            la chiave che la rende riconoscibile ai suoi membri. Monta una cartella o un volume
            sulla directory dei dati <em>prima</em> di configurarla — dopo significherebbe rifare
            tutto.
          </div>
        )}

        {error !== undefined && <div className="alert error">{error}</div>}

        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span className="label-text">Codice di configurazione</span>
            <input
              autoFocus
              onChange={(event) => setForm({ ...form, setupToken: event.target.value })}
              required
              value={form.setupToken}
            />
            <span className="hint">
              Lo trovi stampato nella console dell'istanza. Non finisce nei log e cambia a ogni
              riavvio.
            </span>
          </label>

          <label>
            <span className="label-text">Nome del quartiere</span>
            <input
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Via Roma"
              required
              value={form.name}
            />
          </label>

          <label>
            <span className="label-text">Descrizione</span>
            <textarea
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Il feed di chi abita in via Roma."
              value={form.description}
            />
            <span className="hint">
              La vedrà chi riceve un invito, prima di chiedere di entrare.
            </span>
          </label>

          <label>
            <span className="label-text">Il tuo nome utente</span>
            <input
              onChange={(event) =>
                setForm({ ...form, adminUsername: event.target.value.toLowerCase() })
              }
              pattern="[a-z0-9][a-z0-9_.\-]{1,30}[a-z0-9]"
              placeholder="palu"
              required
              value={form.adminUsername}
            />
          </label>

          <label>
            <span className="label-text">La tua password</span>
            <input
              minLength={PASSWORD_MIN_LENGTH}
              onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
              required
              type="password"
              value={form.adminPassword}
            />
            <span className="hint">Almeno {PASSWORD_MIN_LENGTH} caratteri.</span>
          </label>

          <button disabled={busy} type="submit">
            {busy ? "Creo l'istanza…" : "Crea l'istanza"}
          </button>
        </form>
      </div>
    </main>
  );
}
