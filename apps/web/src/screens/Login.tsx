import { useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api.js";
import { useApp } from "../state.js";

export function Login(): React.ReactElement {
  const { instance, signIn } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const session = await api.login({
        deviceLabel: navigator.userAgent.includes("Mobile") ? "Telefono" : "Computer",
        password,
        username,
      });

      signIn(session.token, session.user);
    } catch (cause) {
      // Deliberately the same message for a wrong password and an unknown
      // account: the API does not distinguish them, and neither should we.
      setError(
        cause instanceof ApiError
          ? "Nome utente o password non validi."
          : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="narrow">
      <div className="card">
        <h1>{instance.name}</h1>
        <p className="muted">{instance.description}</p>

        {error !== undefined && <div className="alert error">{error}</div>}

        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span className="label-text">Nome utente</span>
            <input
              autoFocus
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>

          <label>
            <span className="label-text">Password</span>
            <input
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <button disabled={busy} type="submit">
            {busy ? "Entro…" : "Entra"}
          </button>
        </form>
      </div>

      <p className="muted center">
        Hai un invito? <Link to="/entra">Chiedi di entrare</Link> · Password dimenticata?{" "}
        <Link to="/recupera">Usa il codice di recupero</Link>
      </p>
    </main>
  );
}
