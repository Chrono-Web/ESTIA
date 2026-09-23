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
      // Il motivo lo sa chi ha provato ad aprire la copia, e lo dice in
      // italiano: frase sbagliata, o una copia di prima del passaggio che su
      // questo browser non serve (euristica 9).
      setErrore(
        causa instanceof Error && causa.message.length > 0
          ? causa.message
          : "Questa frase segreta non apre la copia. Riprova.",
      );
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
          la tua frase segreta la apre e rimette qui la stessa chiave, così rientri nelle tue
          conversazioni al posto del browser di prima.
        </p>
        <p className="muted chiavi__testo">
          La cronologia torna appena un&apos;altra persona di ciascuna conversazione la riapre: è
          lei che, aprendola, ti riconsegna la chiave per leggerla.
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
        Entrando senza, questo browser si fa una chiave sua: rientri nelle conversazioni lo stesso,
        ma il browser di prima ci resta come un tuo dispositivo in più. Rimettendo la chiave,
        invece, lo sostituisci. La copia non si cancella.
      </p>
    </main>
  );
}
