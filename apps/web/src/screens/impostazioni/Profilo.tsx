import { DISPLAY_NAME_MAX_LENGTH, type ProfileView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../../api.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, TextAreaField, TextField } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

const BIO_MAX = 500;

/**
 * Il nome che si mostra e le due righe su di sé.
 *
 * Il **nome utente non è qui**, e non per dimenticanza: è l'identità con cui
 * una persona è conosciuta su questa istanza e — quando un follow attraversa
 * la rete — anche altrove. Cambiarlo romperebbe ogni riga che la nomina. Il
 * nome visibile invece non lo usa nessun'altra tabella, e si cambia quando si
 * vuole.
 */
export function ProfiloImpostazioni(): React.ReactElement {
  const { refreshUser, token } = useSignedIn();
  const [profilo, setProfilo] = useState<ProfileView | undefined>();
  const [nome, setNome] = useState("");
  const [bio, setBio] = useState("");
  const [nota, setNota] = useState<string | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void api.profile(token).then((mio) => {
      setProfilo(mio);
      setNome(mio.displayName);
      setBio(mio.bio);
    });
  }, [token]);

  if (profilo === undefined) {
    return (
      <Sezione titolo="Profilo">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  const salva = async (): Promise<void> => {
    setSalvando(true);
    setNota(undefined);
    setErrore(undefined);

    try {
      const salvato = await api.updateProfile(token, {
        bio,
        displayName: nome,
        openFollows: profilo.openFollows,
        presence: profilo.presence,
      });

      setProfilo(salvato);
      // La cornice mostra la persona: senza questo, il nome vecchio resterebbe
      // nella colonna laterale fino al prossimo caricamento della pagina.
      await refreshUser();
      setNota("Salvato.");
    } catch (causa) {
      setErrore(causa instanceof Error ? causa.message : String(causa));
    } finally {
      setSalvando(false);
    }
  };

  const cambiato = nome !== profilo.displayName || bio !== profilo.bio;

  return (
    <Sezione titolo="Profilo">
      <div className="card">
        {errore !== undefined && <Alert tone="error">{errore}</Alert>}
        {nota !== undefined && <Alert tone="ok">{nota}</Alert>}

        <TextField
          hint="È come vuoi essere chiamato. Puoi cambiarlo quando vuoi."
          label="Nome visibile"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          onChange={(event) => setNome(event.target.value)}
          value={nome}
        />

        <TextField
          disabled
          hint="Non si cambia: è il nome con cui ti conoscono qui e sulle altre istanze, e i follow poggiano su di esso."
          label="Nome utente"
          readOnly
          value={`@${profilo.username}`}
        />

        <TextAreaField
          hint={`${String(BIO_MAX - bio.length)} caratteri rimasti.`}
          label="Due righe su di te"
          maxLength={BIO_MAX}
          onChange={(event) => setBio(event.target.value)}
          rows={3}
          value={bio}
        />

        <Button disabled={!cambiato || salvando} onClick={() => void salva()}>
          {salvando ? "Salvo…" : "Salva"}
        </Button>
      </div>
    </Sezione>
  );
}
