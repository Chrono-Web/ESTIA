import type { FollowsView, Presence, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../../api.js";
import { useSignedIn } from "../../state.js";
import { Alert, Button, Choice } from "../../ui/index.js";
import { Sezione } from "./Sezione.js";

/**
 * Fin dove arrivi, e che cosa succede quando qualcuno preme il pulsante.
 *
 * Sono **due impostazioni distinte** e non vanno fuse: la presenza dice se ti
 * si trova, i follow aperti dicono che cosa succede a chi ti ha trovato.
 * «Pubblico e chiuso» è una combinazione sensata — sono trovabile, e scelgo chi
 * mi legge — e un interruttore solo la renderebbe impossibile (ADR 0022 §3).
 *
 * Ogni scelta porta scritta la sua conseguenza, non la sua parafrasi: sono
 * decisioni sulla propria visibilità, e tre etichette non basterebbero.
 */
const PRESENZE: { value: Presence; titolo: string; nota: string }[] = [
  {
    nota: "Esisti solo dentro questa istanza. Nessuna altra istanza sa che ci sei, e non compari in nessuna ricerca.",
    titolo: "Non presente nella rete",
    value: "non_presente",
  },
  {
    nota: "Chi ha già il tuo nome può raggiungerti, ma non compari in nessuna ricerca: ti si trova solo se qualcuno ti indica.",
    titolo: "Presente, e privato",
    value: "presente_privato",
  },
  {
    nota: "Compari nelle ricerche fatte dalle istanze collegate. Il tuo nome viaggia solo quando qualcuno cerca: nessuna ne tiene una copia, quindi il giorno che torni indietro sparisci subito.",
    titolo: "Presente, e trovabile",
    value: "presente_pubblico",
  },
];

export function Presenza(): React.ReactElement {
  const { token } = useSignedIn();
  const [profilo, setProfilo] = useState<ProfileView | undefined>();
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [nota, setNota] = useState<string | undefined>();

  const carica = useCallback(async () => {
    const [mio, relazioni] = await Promise.all([api.profile(token), api.follows(token)]);

    setProfilo(mio);
    setFollows(relazioni);
  }, [token]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (profilo === undefined) {
    return (
      <Sezione titolo="Chi ti trova, chi ti segue">
        <p className="muted">Carico…</p>
      </Sezione>
    );
  }

  const salva = async (cambio: Partial<ProfileView>): Promise<void> => {
    setNota(undefined);

    try {
      setProfilo(
        await api.updateProfile(token, {
          bio: profilo.bio,
          openFollows: cambio.openFollows ?? profilo.openFollows,
          presence: cambio.presence ?? profilo.presence,
        }),
      );
    } catch (causa) {
      setNota(causa instanceof Error ? causa.message : String(causa));
    }
  };

  const decidi = async (azione: () => Promise<void>): Promise<void> => {
    await azione();
    await carica();
  };

  const inAttesa = follows?.followers.filter((row) => row.state === "in_attesa") ?? [];

  return (
    <Sezione titolo="Chi ti trova, chi ti segue">
      {nota !== undefined && <Alert tone="error">{nota}</Alert>}

      {inAttesa.length > 0 && (
        <div className="card card--flush">
          <h2 className="gruppo">Vogliono seguirti</h2>
          {inAttesa.map((row) => (
            <div className="row" key={row.id}>
              <span className="row__body">
                <span className="row__title">@{row.username}</span>
                <span className="row__note">
                  {row.instanceKey === "locale"
                    ? "Da questa istanza"
                    : `Da un'istanza che si identifica con ${row.instanceKey.slice(0, 16)}…: quel nome lo dichiara lei, l'unica cosa verificata è l'istanza`}
                </span>
              </span>
              <span className="row__end">
                <Button onClick={() => void decidi(() => api.acceptFollower(token, row.id))}>
                  Accetta
                </Button>
                <Button
                  onClick={() => void decidi(() => api.removeFollower(token, row.id))}
                  variant="secondary"
                >
                  Rifiuta
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Fin dove arrivi</h2>
        {PRESENZE.map((opzione) => (
          <Choice
            checked={profilo.presence === opzione.value}
            key={opzione.value}
            name="presenza"
            note={opzione.nota}
            onChoose={() => void salva({ presence: opzione.value })}
            title={opzione.titolo}
          />
        ))}
      </div>

      <div className="card">
        <h2>Chi può seguirti</h2>
        <Choice
          checked={!profilo.openFollows}
          name="follow"
          note="È il default: chi ti segue lo decidi tu, uno per uno."
          onChoose={() => void salva({ openFollows: false })}
          title="Approvo io"
        />
        <Choice
          checked={profilo.openFollows}
          name="follow"
          note="Chi ti trova comincia a seguirti senza chiedere."
          onChoose={() => void salva({ openFollows: true })}
          title="Chiunque, senza chiedere"
        />
        <p className="muted">
          È distinto da «fin dove arrivi» di proposito: quella dice se ti si trova, questa dice che
          cosa succede quando chi ti ha trovato preme il pulsante.
        </p>
      </div>

      <div className="card card--flush">
        <h2 className="gruppo">Chi segui</h2>
        {follows === undefined || follows.following.length === 0 ? (
          <p className="empty">Nessuno, per ora. Qualcuno si trova dalla ricerca.</p>
        ) : (
          follows.following.map((row) => (
            <div className="row" key={row.id}>
              <span className="row__body">
                <span className="row__title">@{row.username}</span>
                <span className="row__note">
                  {row.instanceKey === "locale" ? "Su questa istanza" : "Su un'altra istanza"}
                  {row.state === "in_attesa" ? " · richiesta in attesa" : ""}
                </span>
              </span>
              <span className="row__end">
                <Button
                  onClick={() => void decidi(() => api.unfollow(token, row.id))}
                  variant="secondary"
                >
                  Smetti
                </Button>
              </span>
            </div>
          ))
        )}
      </div>
    </Sezione>
  );
}
