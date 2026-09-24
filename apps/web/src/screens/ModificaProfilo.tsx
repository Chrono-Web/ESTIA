import { DISPLAY_NAME_MAX_LENGTH, type ProfileView } from "@estia/contracts";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api.js";
import { spiega } from "../errori.js";
import { T, t } from "../i18n/index.js";
import { useSignedIn } from "../state.js";
import { Alert, Avatar, Button, ListRow, TextAreaField, TextField } from "../ui/index.js";
import { titoloSezione } from "./impostazioni/sezioni.js";

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
      // Il messaggio grezzo dell'istanza, o del browser, non è nella lingua di
      // chi legge: `spiega` usa la frase del codice d'errore, o questa.
      setErrore(spiega(causa, t("profile.edit.error")));
      setSalvando(false);
    }
  };

  if (profilo === undefined) {
    return (
      <main className="column column--feed">
        <p className="muted feed-pad">{t("profile.loading")}</p>
      </main>
    );
  }

  const cambiato = nome !== profilo.displayName || bio !== profilo.bio;
  // Il nome è quello della sezione a cui porta la riga: si scrive una volta sola.
  const titoloPresenza = titoloSezione("presenza");

  return (
    <main className="column column--feed">
      <header className="modifica-head">
        <Button onClick={annulla} variant="quiet">
          {t("profile.edit.cancel")}
        </Button>
        <h1 className="modifica-head__titolo">{t("profile.edit.title")}</h1>
        <Button disabled={!cambiato || salvando} onClick={() => void salva()} variant="quiet">
          {salvando ? "…" : t("profile.edit.done")}
        </Button>
      </header>

      <div className="modifica-corpo">
        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        <div className="modifica-cima">
          <div className="modifica-campi">
            <TextField
              label={t("profile.edit.name")}
              maxLength={DISPLAY_NAME_MAX_LENGTH}
              onChange={(event) => setNome(event.target.value)}
              value={nome}
            />
            <TextField
              disabled
              hint={t("profile.edit.username_hint")}
              label={t("profile.edit.username")}
              readOnly
              value={`@${profilo.username}`}
            />
          </div>
          <Avatar displayName={nome || profilo.displayName} size="xl" username={profilo.username} />
        </div>

        <TextAreaField
          hint={t("profile.edit.bio_left", { count: BIO_MAX - bio.length })}
          label={t("profile.edit.bio")}
          maxLength={BIO_MAX}
          onChange={(event) => setBio(event.target.value)}
          rows={4}
          value={bio}
        />

        <div className="list-block">
          <ListRow
            icon="globe"
            note={t("profile.edit.presence_note")}
            title={titoloPresenza}
            to="/impostazioni/presenza"
          />
        </div>

        <p className="muted">
          <T
            k="profile.edit.settings_elsewhere"
            tags={{ link: (testo) => <Link to="/impostazioni">{testo}</Link> }}
          />
        </p>
      </div>
    </main>
  );
}
