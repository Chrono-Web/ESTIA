import type { FollowsView, Presence, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";

/**
 * La pagina di una persona, non un modulo di configurazione.
 *
 * La prima versione era un elenco di impostazioni con la ricerca infilata in
 * fondo, e sbagliava due cose: un profilo è **quello che gli altri vedono di
 * te**, e la ricerca non riguarda te — ha una pagina sua (`Esplora`).
 *
 * Quindi qui si vede prima la persona — nome, handle, due righe, quanti segue e
 * da quanti è seguita — e le impostazioni stanno dietro «Modifica profilo»,
 * dove stanno su qualunque cosa somigli a questa.
 */

const PRESENZE: { value: Presence; titolo: string; spiegazione: string }[] = [
  {
    spiegazione:
      "Esisti solo dentro questa istanza. Nessuna altra istanza sa che ci sei, e non compari in nessuna ricerca.",
    titolo: "Non presente nella rete",
    value: "non_presente",
  },
  {
    spiegazione:
      "Chi ha già il tuo nome può raggiungerti, ma non compari in nessuna ricerca: ti si trova solo se qualcuno ti indica.",
    titolo: "Presente, e privato",
    value: "presente_privato",
  },
  {
    spiegazione:
      "Compari nelle ricerche fatte dalle istanze collegate a questa. Il tuo nome viaggia solo quando qualcuno cerca: nessuna istanza ne tiene una copia, quindi il giorno che torni indietro sparisci subito.",
    titolo: "Presente, e trovabile",
    value: "presente_pubblico",
  },
];

function presenzaBreve(presence: Presence): string {
  switch (presence) {
    case "non_presente":
      return "Non sei nella rete fra istanze";
    case "presente_privato":
      return "Nella rete, ma non nelle ricerche";
    case "presente_pubblico":
      return "Nella rete, e trovabile";
  }
}

export function Profile(): React.ReactElement {
  const { token, user } = useSignedIn();
  const [profile, setProfile] = useState<ProfileView | undefined>();
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [presence, setPresence] = useState<Presence>("non_presente");
  const [openFollows, setOpenFollows] = useState(false);
  const [note, setNote] = useState<string | undefined>();

  const load = useCallback(async () => {
    const [mine, relations] = await Promise.all([api.profile(token), api.follows(token)]);

    setProfile(mine);
    setFollows(relations);
    setBio(mine.bio);
    setPresence(mine.presence);
    setOpenFollows(mine.openFollows);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    setNote(undefined);

    try {
      setProfile(await api.updateProfile(token, { bio, openFollows, presence }));
      setEditing(false);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };

  const act = async (action: () => Promise<void>): Promise<void> => {
    await action();
    await load();
  };

  if (profile === undefined || follows === undefined) {
    return <main>Carico…</main>;
  }

  const inAttesa = follows.followers.filter((row) => row.state === "in_attesa");
  const accettati = follows.followers.filter((row) => row.state === "accettato");

  return (
    <main>
      {/* L'intestazione: chi sei, in due righe, come su qualunque profilo. */}
      <h2>{profile.displayName}</h2>
      <div className="muted">
        <code>@{profile.username}</code> ·{" "}
        {user?.role === "instance_admin" ? "amministra" : "abita"} questa istanza
      </div>
      {profile.bio !== "" && <p>{profile.bio}</p>}
      <div className="muted">
        <strong>{follows.following.length}</strong> segu
        {follows.following.length === 1 ? "e" : "iti"} · <strong>{accettati.length}</strong>{" "}
        follower
        {accettati.length === 1 ? "" : ""} · {presenzaBreve(profile.presence)}
        {profile.presence !== "non_presente" &&
          (profile.openFollows ? " · chiunque può seguirti" : " · i follow li approvi tu")}
      </div>

      <button onClick={() => setEditing(!editing)} type="button">
        {editing ? "Lascia stare" : "Modifica profilo"}
      </button>

      {editing && (
        <>
          <h3>Due righe su di te</h3>
          <textarea
            maxLength={500}
            onChange={(event) => setBio(event.target.value)}
            rows={3}
            value={bio}
          />
          <div className="muted">{500 - bio.length} caratteri rimasti.</div>

          <h3>Fin dove arrivi</h3>
          {PRESENZE.map((opzione) => (
            <div className="row" key={opzione.value}>
              <div className="grow">
                <label>
                  <input
                    checked={presence === opzione.value}
                    name="presenza"
                    onChange={() => setPresence(opzione.value)}
                    type="radio"
                  />{" "}
                  {opzione.titolo}
                </label>
                <div className="muted">{opzione.spiegazione}</div>
              </div>
            </div>
          ))}

          <h3>Chi può seguirti</h3>
          <div className="muted">
            {/* Distinto dalla presenza di proposito: quella dice se ti si
                trova, questo dice che cosa succede quando chi ti ha trovato
                preme il pulsante (ADR 0022 §3). */}
            <label>
              <input
                checked={!openFollows}
                onChange={() => setOpenFollows(false)}
                type="radio"
                name="follow"
              />{" "}
              Approvo io, uno per uno
            </label>
            <div className="muted">È il default: chi ti segue lo decidi tu.</div>
            <label>
              <input
                checked={openFollows}
                onChange={() => setOpenFollows(true)}
                type="radio"
                name="follow"
              />{" "}
              Chiunque, senza chiedere
            </label>
          </div>

          <button onClick={() => void save()} type="button">
            Salva
          </button>
          {note !== undefined && <div className="muted">{note}</div>}
        </>
      )}

      {inAttesa.length > 0 && (
        <>
          <h3>Vogliono seguirti</h3>
          {inAttesa.map((row) => (
            <div className="row" key={row.id}>
              <div className="grow">
                <code>@{row.username}</code>
                <div className="muted">
                  Da un&apos;istanza che si identifica con{" "}
                  <code>{row.instanceKey.slice(0, 16)}…</code>. Quel nome lo dichiara lei:
                  l&apos;unica cosa verificata è l&apos;istanza.
                </div>
              </div>
              <div>
                <button
                  onClick={() => void act(() => api.acceptFollower(token, row.id))}
                  type="button"
                >
                  Accetta
                </button>{" "}
                <button
                  onClick={() => void act(() => api.removeFollower(token, row.id))}
                  type="button"
                >
                  Rifiuta
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <h3>Chi segui</h3>
      {follows.following.length === 0 ? (
        <div className="muted">
          Nessuno, per ora. Si trova qualcuno da <strong>Esplora</strong>.
        </div>
      ) : (
        follows.following.map((row) => (
          <div className="row" key={row.id}>
            <div className="grow">
              <code>@{row.username}</code>
              <div className="muted">
                {row.instanceKey === "locale" ? "Su questa istanza" : "Su un'altra istanza"}
                {row.state === "in_attesa" ? " · richiesta in attesa" : ""}
              </div>
            </div>
            <div>
              <button onClick={() => void act(() => api.unfollow(token, row.id))} type="button">
                Smetti
              </button>
            </div>
          </div>
        ))
      )}

      <h3>Chi ti segue</h3>
      {accettati.length === 0 ? (
        <div className="muted">Nessuno, per ora.</div>
      ) : (
        accettati.map((row) => (
          <div className="row" key={row.id}>
            <div className="grow">
              <code>@{row.username}</code>
              <div className="muted">
                {row.instanceKey === "locale"
                  ? "Su questa istanza"
                  : `Da ${row.instanceKey.slice(0, 16)}…`}
              </div>
            </div>
            <div>
              <button
                onClick={() => void act(() => api.removeFollower(token, row.id))}
                type="button"
              >
                Togli
              </button>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
