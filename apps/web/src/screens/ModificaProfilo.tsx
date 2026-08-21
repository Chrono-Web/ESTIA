import { DISPLAY_NAME_MAX_LENGTH, type ProfileView } from "@estia/contracts";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { Alert, Avatar, Button, ListRow, TextAreaField, TextField } from "../ui/index.js";

const BIO_MAX = 500;

/**
 * Modificare il profilo: una pagina sua, non una voce delle impostazioni.
 *
 * Come su Threads: annulla a sinistra, salva a destra, e in mezzo solo ciò
 * che gli altri vedono di te — nome, handle, bio. La presenza (chi ti trova)
 * è un salto da qui, ma resta una scelta distinta e non si confonde col nome.
 *
 * Il **nome utente non si cambia**: è l'identità su cui poggiano i follow.
 */
export function ModificaProfilo(): React.ReactElement {
  const { refreshUser, token, user } = useSignedIn();
  const navigate = useNavigate();
  const [profilo, setProfilo] = useState<ProfileView | undefined>();
  const [nome, setNome] = useState("");
  const [bio, setBio] = useState("");
  const [errore, setErrore] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void api.profile(token).then((mio) => {
      setProfilo(mio);
      setNome(mio.displayName);
      setBio(mio.bio);
    });
  }, [token]);

  const annulla = (): void => {
    void navigate(user !== undefined ? `/@${user.username}` : "/");
  };

  const salva = async (): Promise<void> => {
    if (profilo === undefined) {
      return;
    }

    setSalvando(true);
    setErrore(undefined);

    try {
      await api.updateProfile(token, {
        bio,
        displayName: nome,
        openFollows: profilo.openFollows,
        presence: profilo.presence,
      });
      await refreshUser();
      void navigate(`/@${profilo.username}`);
    } catch (causa) {
      setErrore(causa instanceof Error ? causa.message : String(causa));
      setSalvando(false);
    }
  };

  if (profilo === undefined) {
    return (
      <main className="column column--feed">
        <p className="muted feed-pad">Carico…</p>
      </main>
    );
  }

  const cambiato = nome !== profilo.displayName || bio !== profilo.bio;

  return (
    <main className="column column--feed">
      <header className="modifica-head">
        <Button onClick={annulla} variant="quiet">
          Annulla
        </Button>
        <h1 className="modifica-head__titolo">Modifica profilo</h1>
        <Button disabled={!cambiato || salvando} onClick={() => void salva()} variant="quiet">
          {salvando ? "…" : "Fine"}
        </Button>
      </header>

      <div className="modifica-corpo">
        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <div className="modifica-cima">
          <div className="modifica-campi">
            <TextField
              label="Nome"
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) => setNome(event.target.value)}
              value={nome}
            />
            <TextField
              disabled
              hint="Non si cambia: è il nome con cui ti conoscono qui e sulle altre istanze."
              label="Nome utente"
              readOnly
              value={`@${profilo.username}`}
            />
          </div>
          <Avatar displayName={nome || profilo.displayName} size="xl" username={profilo.username} />
        </div>

        <TextAreaField
          hint={`${String(BIO_MAX - bio.length)} caratteri rimasti.`}
          label="Biografia"
          maxLength={BIO_MAX}
          onChange={(event) => setBio(event.target.value)}
          rows={4}
          value={bio}
        />

        <div className="list-block">
          <ListRow
            icon="globe"
            note="Fin dove arrivi nella rete, e chi può seguirti"
            title="Chi ti trova, chi ti segue"
            to="/impostazioni/presenza"
          />
        </div>

        <p className="muted">
          Le altre impostazioni — dispositivi, istanza, amministrazione — stanno nel{" "}
          <Link to="/impostazioni">menù</Link>.
        </p>
      </div>
    </main>
  );
}
