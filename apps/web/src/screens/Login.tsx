import { useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../api.js";
import { nomeIstanza, useApp } from "../state.js";
import { Alert, Button, TextField } from "../ui/index.js";

export function Login(): React.ReactElement {
  const { instance, signIn } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const entra = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setOccupato(true);
    setErrore(undefined);

    try {
      const sessione = await api.login({
        deviceLabel: navigator.userAgent.includes("Mobile") ? "Telefono" : "Computer",
        password,
        username,
      });

      signIn(sessione.token, sessione.user);
    } catch (causa) {
      // Lo stesso messaggio per una password sbagliata e per un account che non
      // esiste: l'API non li distingue, e nemmeno questa schermata deve.
      setErrore(
        causa instanceof ApiError
          ? "Nome utente o password non validi."
          : "Non riesco a contattare l'istanza.",
      );
    } finally {
      setOccupato(false);
    }
  };

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>{nomeIstanza(instance)}</h1>
        {instance.description !== undefined && instance.description !== "" && (
          <p className="muted">{instance.description}</p>
        )}

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void entra(event)}>
          <TextField
            autoComplete="username"
            autoFocus
            label="Nome utente"
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
          <TextField
            autoComplete="current-password"
            label="Password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <Button block disabled={occupato} type="submit">
            {occupato ? "Entro…" : "Entra"}
          </Button>
        </form>
      </div>

      <p className="muted center">
        Hai un invito? <Link to="/entra">Chiedi di entrare</Link>
        <br />
        Password dimenticata? <Link to="/recupera">Usa il codice di recupero</Link>
      </p>
    </main>
  );
}
