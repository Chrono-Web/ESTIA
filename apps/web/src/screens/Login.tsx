import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api.js";
import { spiega } from "../errori.js";
import { useT } from "../lingua.js";
import { nomeIstanza, useApp } from "../state.js";
import { Alert, Button, TextField } from "../ui/index.js";

export function Login(): React.ReactElement {
  const { instance, signIn } = useApp();
  const { t, tc } = useT();
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
        deviceLabel: navigator.userAgent.includes("Mobile")
          ? t("comune.dispositivo.telefono")
          : t("comune.dispositivo.computer"),
        password,
        username,
      });

      signIn(sessione.token, sessione.user);
    } catch (causa) {
      // Una password sbagliata e un account che non esiste danno lo stesso
      // codice: l'API non li distingue, e la frase della tabella nemmeno. Un
      // limite di frequenza invece ha la sua, e non va spacciato per l'altra.
      setErrore(spiega(causa, t("comune.istanza_irraggiungibile")));
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
            label={t("comune.nome_utente")}
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
          <TextField
            autoComplete="current-password"
            label={t("comune.password")}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <Button block disabled={occupato} type="submit">
            {occupato ? t("accesso.entro") : t("accesso.entra")}
          </Button>
        </form>
      </div>

      <p className="muted center">
        {tc("accesso.hai_un_invito", {
          link: <Link to="/entra">{t("accesso.chiedi_di_entrare")}</Link>,
        })}
        <br />
        {tc("accesso.password_dimenticata", {
          link: <Link to="/recupera">{t("accesso.usa_codice_recupero")}</Link>,
        })}
      </p>
    </main>
  );
}
