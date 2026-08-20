import type { FollowsView, ProfileSearchResult } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";

/**
 * Trovare qualcuno, e basta.
 *
 * Stava dentro il profilo, ed era il posto sbagliato: cercare non riguarda te.
 *
 * Le due metà del risultato restano separate a schermo perché sono due cose
 * diverse. Chi sta qui è **nell'istanza**, e lo si vede sempre. Chi sta altrove
 * arriva da una domanda fatta **adesso** alle istanze collegate, e ADR 0018
 * chiede che si dica **tramite chi** è stato trovato: un nome senza la casa da
 * cui viene non è un'identità, e quel nome lo dichiara quell'istanza.
 */
export function Esplora(): React.ReactElement {
  const { token } = useSignedIn();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ProfileSearchResult | undefined>();
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<string | undefined>();

  const loadFollows = useCallback(async () => {
    setFollows(await api.follows(token));
  }, [token]);

  useEffect(() => {
    void loadFollows();
  }, [loadFollows]);

  const search = async (): Promise<void> => {
    setSearching(true);
    setNote(undefined);

    try {
      setResults(await api.searchProfiles(token, term));
    } finally {
      setSearching(false);
    }
  };

  const segui = async (instanceKey: string, username: string): Promise<void> => {
    setNote(undefined);

    try {
      await api.follow(token, { instanceKey, username });
      await loadFollows();
      setNote(`Richiesta mandata a @${username}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };

  /** Quello che già si segue non offre un pulsante che non farebbe niente. */
  const stato = (instanceKey: string, username: string): string | undefined =>
    follows?.following.find((row) => row.username === username && row.instanceKey === instanceKey)
      ?.state;

  const bottone = (instanceKey: string, username: string): React.ReactElement => {
    const corrente = stato(instanceKey, username);

    if (corrente === "accettato") {
      return <span className="muted">Lo segui</span>;
    }

    if (corrente === "in_attesa") {
      return <span className="muted">Richiesta in attesa</span>;
    }

    return (
      <button onClick={() => void segui(instanceKey, username)} type="button">
        Segui
      </button>
    );
  };

  return (
    <main>
      <h2>Esplora</h2>
      <div className="muted">
        Cerca fra chi abita questa istanza e fra i profili pubblici delle istanze collegate. La
        domanda parte adesso verso ognuna di loro: se una è spenta, semplicemente non risponde — e
        nessuna tiene una copia di chi c&apos;è, quindi non ci sono elenchi che invecchiano.
      </div>

      <input
        onChange={(event) => setTerm(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && term.trim() !== "") {
            void search();
          }
        }}
        placeholder="Un nome"
        value={term}
      />
      <button
        disabled={searching || term.trim() === ""}
        onClick={() => void search()}
        type="button"
      >
        {searching ? "Cerco…" : "Cerca"}
      </button>
      {note !== undefined && <div className="muted">{note}</div>}

      {results !== undefined && (
        <>
          <h3>Qui</h3>
          {results.locali.length === 0 ? (
            <div className="muted">Nessuno con questo nome.</div>
          ) : (
            results.locali.map((found) => (
              <div className="row" key={found.username}>
                <div className="grow">
                  <strong>{found.displayName}</strong> <code>@{found.username}</code>
                  {found.bio !== "" && <div className="muted">{found.bio}</div>}
                </div>
                <div>{bottone("locale", found.username)}</div>
              </div>
            ))
          )}

          <h3>Sulle istanze collegate</h3>
          {results.remoti.length === 0 ? (
            <div className="muted">
              Nessuno, o nessuna istanza collegata ha risposto. Le connessioni si aggiungono
              dall&apos;amministrazione.
            </div>
          ) : (
            results.remoti.map((found) => (
              <div className="row" key={`${found.instanceKey}/${found.username}`}>
                <div className="grow">
                  <strong>{found.displayName}</strong> <code>@{found.username}</code>
                  <div className="muted">
                    Trovato tramite{" "}
                    <strong>
                      {found.tramite === "" ? "un'istanza senza nome dichiarato" : found.tramite}
                    </strong>
                    , che è il nome che quell&apos;istanza dà a sé stessa.
                  </div>
                </div>
                <div>{bottone(found.instanceKey, found.username)}</div>
              </div>
            ))
          )}
        </>
      )}
    </main>
  );
}
