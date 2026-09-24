import { useState } from "react";

import { t } from "../i18n/index.js";
import { Alert, Button, TextField } from "../ui/index.js";

interface RestoreIdentityProps {
  onRestore: (passphrase: string) => Promise<void>;
  onSkip: () => void;
}

export function RestoreIdentity({ onRestore, onSkip }: RestoreIdentityProps): React.ReactElement {
  const [passphrase, setPassphrase] = useState("");
  const [errore, setErrore] = useState<string | undefined>();
  const [occupato, setOccupato] = useState(false);

  const procedi = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setOccupato(true);
    setErrore(undefined);

    try {
      await onRestore(passphrase);
    } catch (causa) {
      // Il motivo lo sa chi ha provato ad aprire la copia, e lo dice in
      // italiano: frase sbagliata, o una copia di prima del passaggio che su
      // questo browser non serve (euristica 9).
      setErrore(
        causa instanceof Error && causa.message.length > 0
          ? causa.message
          : t("auth.restore.error"),
      );
    } finally {
      setOccupato(false);
    }
  };

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>{t("auth.restore.title")}</h1>
        <p className="muted chiavi__testo">{t("auth.restore.body")}</p>
        <p className="muted chiavi__testo">{t("auth.restore.history")}</p>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void procedi(event)} className="stack">
          <TextField
            autoFocus
            label={t("auth.restore.passphrase")}
            onChange={(event) => setPassphrase(event.target.value)}
            required
            type="password"
            value={passphrase}
          />

          <Button block disabled={occupato || passphrase.length === 0} type="submit">
            {occupato ? t("auth.restore.submitting") : t("auth.restore.submit")}
          </Button>
          <Button block variant="secondary" disabled={occupato} type="button" onClick={onSkip}>
            {t("auth.restore.skip")}
          </Button>
        </form>
      </div>

      <p className="muted center chiavi__testo">{t("auth.restore.skip_note")}</p>
    </main>
  );
}
