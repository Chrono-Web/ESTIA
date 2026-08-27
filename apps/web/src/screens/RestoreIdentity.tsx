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
    } catch {
      setErrore("Questa frase segreta non apre la copia. Riprova.");
    } finally {
      setOccupato(false);
    }
  };

  return (
    <main className="column column--narrow stack">
      <div className="card">
        <h1>Le tue chiavi non sono su questo browser</h1>
        <p className="muted chiavi__testo">
          Le chiavi dei messaggi privati nascono nel browser e restano lì, quindi questo — che è
          nuovo, o che è stato svuotato — non ha le tue. Ne esiste però una copia sull&apos;istanza:
          la tua frase segreta la apre e rimette le stesse chiavi qui, così ritrovi i messaggi di
          prima.
        </p>

        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <form onSubmit={(event) => void procedi(event)} className="stack">
          <TextField
            autoFocus
            label="Frase segreta"
            onChange={(event) => setPassphrase(event.target.value)}
            required
            type="password"
            value={passphrase}
          />

          <Button block disabled={occupato || passphrase.length === 0} type="submit">
            {occupato ? "Un momento…" : "Rimetti le chiavi qui"}
          </Button>
          <Button block variant="secondary" disabled={occupato} type="button" onClick={onSkip}>
            Entra senza, per ora
          </Button>
        </form>
      </div>

      <p className="muted center chiavi__testo">
        Entrando senza, questo browser si fa chiavi sue: i messaggi nuovi funzionano, quelli di
        prima restano chiusi <em>qui</em>. La copia però non si cancella — puoi rimettere le chiavi
        più tardi da <strong>Impostazioni → Accesso e dispositivi</strong>.
      </p>
    </main>
  );
}
