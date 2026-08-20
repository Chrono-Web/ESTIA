import type { Presence, ProfileSearchResult, ProfileView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";

/**
 * Il profilo, e fin dove arriva.
 *
 * Le tre presenze sono una scelta della persona e non dell'istanza (ADR 0018),
 * e il default è la più stretta: chi non apre mai questa schermata non è in
 * rete. Sono presentate con le conseguenze accanto, non con tre etichette — la
 * differenza fra «privato» e «pubblico» è che cosa succede quando qualcuno ti
 * cerca, e nessuno la indovina da una parola.
 */

const PRESENZE: { value: Presence; titolo: string; spiegazione: string }[] = [
  {
    spiegazione:
      "Esisti solo dentro questa istanza. Nessuna altra istanza sa che ci sei, e non compari in nessuna ricerca. È così finché non decidi altrimenti.",
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

export function Profile(): React.ReactElement {
  const { token } = useSignedIn();
  const [profile, setProfile] = useState<ProfileView | undefined>();
  const [bio, setBio] = useState("");
  const [presence, setPresence] = useState<Presence>("non_presente");
  const [note, setNote] = useState<string | undefined>();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProfileSearchResult | undefined>();
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const mine = await api.profile(token);

    setProfile(mine);
    setBio(mine.bio);
    setPresence(mine.presence);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (): Promise<void> => {
    setNote(undefined);

    try {
      const saved = await api.updateProfile(token, { bio, presence });

      setProfile(saved);
      setNote("Salvato.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };

  const search = async (): Promise<void> => {
    setSearching(true);

    try {
      setResults(await api.searchProfiles(token, term));
    } finally {
      setSearching(false);
    }
  };

  if (profile === undefined) {
    return <main>Carico…</main>;
  }

  return (
    <main>
      <h2>Il tuo profilo</h2>
      <div className="muted">
        {profile.displayName} — <code>{profile.username}</code>
      </div>

      <label htmlFor="bio">Due righe su di te</label>
      <textarea
        id="bio"
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

      <button onClick={() => void save()} type="button">
        Salva
      </button>
      {note !== undefined && <div className="muted">{note}</div>}

      <h2>Cerca qualcuno</h2>
      <div className="muted">
        Cerca fra i membri di questa istanza e fra i profili pubblici delle istanze collegate. La
        domanda parte adesso verso ognuna di loro: se una è spenta, semplicemente non risponde.
      </div>
      <input onChange={(event) => setTerm(event.target.value)} placeholder="Un nome" value={term} />
      <button
        disabled={searching || term.trim() === ""}
        onClick={() => void search()}
        type="button"
      >
        {searching ? "Cerco…" : "Cerca"}
      </button>

      {results !== undefined && (
        <>
          <h3>Su questa istanza</h3>
          {results.locali.length === 0 ? (
            <div className="muted">Nessuno.</div>
          ) : (
            results.locali.map((found) => (
              <div className="row" key={found.username}>
                <div className="grow">
                  {found.displayName} — <code>{found.username}</code>
                  <div className="muted">{found.bio}</div>
                </div>
              </div>
            ))
          )}

          <h3>Sulle istanze collegate</h3>
          {results.remoti.length === 0 ? (
            <div className="muted">Nessuno, o nessuna istanza collegata ha risposto.</div>
          ) : (
            results.remoti.map((found) => (
              <div className="row" key={`${found.instanceKey}/${found.username}`}>
                <div className="grow">
                  {found.displayName} — <code>{found.username}</code>
                  {/* «Tramite chi» è richiesto da ADR 0018, e il nome
                      dell'istanza è dichiarato da lei: nessuna spunta. */}
                  <div className="muted">
                    Trovato tramite{" "}
                    <strong>
                      {found.tramite === "" ? "un'istanza senza nome dichiarato" : found.tramite}
                    </strong>
                    , che è il nome che quell'istanza dà a sé stessa.
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </main>
  );
}
