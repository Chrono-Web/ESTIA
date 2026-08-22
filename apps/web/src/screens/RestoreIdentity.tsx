import { useState } from "react";
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
      setErrore("La passphrase non è corretta, riprova.");
    } finally {
      setOccupato(false);
    }
  };

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>Bentornato!</h1>
        <p className="muted">
          Abbiamo trovato un backup delle tue chiavi di sicurezza sul server. Inserisci la password
          di sicurezza (passphrase) che avevi scelto per ripristinarle su questo dispositivo e
          decifrare le tue chat passate.
        </p>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void procedi(event)} className="stack">
          <TextField
            autoFocus
            label="Passphrase"
            onChange={(event) => setPassphrase(event.target.value)}
            required
            type="password"
            value={passphrase}
          />

          <Button block disabled={occupato || passphrase.length === 0} type="submit">
            {occupato ? "Ripristino in corso…" : "Ripristina le chat"}
          </Button>
          <Button block variant="secondary" disabled={occupato} type="button" onClick={onSkip}>
            Continua senza ripristinare
          </Button>
        </form>
      </div>

      <p className="muted center">
        <strong>Attenzione:</strong> se scegli di continuare senza ripristinare, non potrai leggere
        i vecchi messaggi su questo dispositivo. Potrai comunque chattare da zero.
      </p>
    </main>
  );
}
