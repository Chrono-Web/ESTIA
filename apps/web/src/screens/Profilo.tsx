import type { FollowsView, PersonView, PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { api } from "../api.js";
import { ModeSwitch } from "../app/ModeSwitch.js";
import { ScreenHead } from "../app/ScreenHead.js";
import { PostCard } from "../components/PostCard.js";
import { useSignedIn } from "../state.js";
import { Alert, Avatar, Button, EmptyState, SkeletonPost } from "../ui/index.js";

function daQuando(valore: string): string {
  return new Date(valore).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

const PRESENZA_BREVE: Record<string, string> = {
  non_presente: "Non sei nella rete fra istanze",
  presente_privato: "Nella rete, ma non nelle ricerche",
  presente_pubblico: "Nella rete, e trovabile",
};

/**
 * La pagina di una persona: quello che gli altri vedono di te.
 *
 * Non è un modulo di configurazione — quello sta nelle impostazioni, dove sta
 * tutto il resto della configurazione. Qui c'è chi sei, chi ti segue, e i tuoi
 * post **nella lente corrente**: in modalità istanza quelli di casa, in
 * modalità rete quelli che escono. Le due non si mescolano, come non si
 * mescolano nel feed.
 */
export function Profilo(): React.ReactElement {
  const { handle } = useParams();
  const { modo, token, user } = useSignedIn();
  const feed = modo === "istanza" ? "locale" : "seguiti";
  const username = handle?.startsWith("@") === true ? handle.slice(1) : undefined;

  const [persona, setPersona] = useState<PersonView | undefined>();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  const [nota, setNota] = useState<string | undefined>();
  const [caricato, setCaricato] = useState(false);

  const carica = useCallback(async () => {
    if (username === undefined) {
      return;
    }

    setCaricato(false);
    setErrore(undefined);

    try {
      const [chi, pagina, relazioni] = await Promise.all([
        api.person(token, username),
        api.personPosts(token, username, { feed }),
        api.follows(token),
      ]);

      setPersona(chi);
      setPosts(pagina.posts);
      setCursor(pagina.nextCursor);
      setFollows(relazioni);
    } catch {
      setErrore("Questo profilo non esiste, o non riesco a leggerlo.");
    } finally {
      setCaricato(true);
    }
  }, [feed, token, username]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (username === undefined) {
    return <Navigate replace to="/" />;
  }

  const ancora = async (): Promise<void> => {
    if (cursor === undefined) {
      return;
    }

    const pagina = await api.personPosts(token, username, { cursor, feed });

    setPosts((correnti) => [...correnti, ...pagina.posts]);
    setCursor(pagina.nextCursor);
  };

  const agisci = async (azione: () => Promise<void>, detto?: string): Promise<void> => {
    setNota(undefined);

    try {
      await azione();
      await carica();
      setNota(detto);
    } catch (causa) {
      setNota(causa instanceof Error ? causa.message : String(causa));
    }
  };

  const smetti = async (): Promise<void> => {
    const riga = follows?.following.find(
      (row) => row.username === username && row.instanceKey === "locale",
    );

    if (riga !== undefined) {
      await agisci(() => api.unfollow(token, riga.id), "Non la segui più.");
    }
  };

  const azione = (chi: PersonView): React.ReactElement => {
    switch (chi.relazione) {
      case "sei_tu":
        return (
          <Link className="btn btn--secondary" to="/impostazioni">
            Modifica profilo
          </Link>
        );
      case "seguito":
        return (
          <Button onClick={() => void smetti()} variant="secondary">
            Smetti di seguire
          </Button>
        );
      case "in_attesa":
        return (
          <Button disabled variant="secondary">
            Richiesta in attesa
          </Button>
        );
      case "nessuna":
        return (
          <Button
            onClick={() =>
              void agisci(
                () => api.follow(token, { instanceKey: "locale", username }),
                "Richiesta mandata.",
              )
            }
          >
            Segui
          </Button>
        );
    }
  };

  const inAttesa =
    persona?.relazione === "sei_tu"
      ? (follows?.followers.filter((row) => row.state === "in_attesa") ?? [])
      : [];

  /*
   * I conti sono di follow **accettati**, e una richiesta in attesa non è un
   * seguito. Ma tacerla fa sembrare rotto un conteggio che è giusto: fuori
   * casa chi accetta non avvisa nessuno (ADR 0022), quindi una richiesta può
   * restare in attesa per sempre senza che niente la muova. Il numero lo dice,
   * e la pagina che la sblocca è a un clic.
   */
  const chiesti =
    persona?.relazione === "sei_tu"
      ? (follows?.following.filter((row) => row.state === "in_attesa").length ?? 0)
      : 0;

  return (
    <>
      <ScreenHead back title={persona?.displayName ?? "Profilo"}>
        <ModeSwitch />
      </ScreenHead>

      <main className="column stack">
        {errore !== undefined && <Alert tone="error">{errore}</Alert>}

        {persona !== undefined && (
          <div className="card card--flush">
            {/* Una fascia colorata al posto di una copertina: non esistono
                immagini di copertina, e uno spazio vuoto sarebbe peggio di un
                colore scelto dal nome. */}
            <div className={`copertina copertina--c${String(persona.username.length % 6)}`} />

            <div className="persona">
              <div className="persona__testa">
                <Avatar displayName={persona.displayName} size="xl" username={persona.username} />
                <span className="grow" />
                {azione(persona)}
              </div>

              <h2 className="persona__nome">{persona.displayName}</h2>
              <div className="muted">@{persona.username}</div>

              {persona.bio !== "" && <p className="persona__bio">{persona.bio}</p>}

              <div className="muted">
                Su questa istanza da {daQuando(persona.createdAt)}
                {persona.presence !== undefined && ` · ${PRESENZA_BREVE[persona.presence] ?? ""}`}
              </div>

              <div className="cluster persona__conti">
                <span>
                  <strong>{persona.followingCount}</strong> segu
                  {persona.followingCount === 1 ? "e" : "iti"}
                </span>
                <span>
                  <strong>{persona.followerCount}</strong> follower
                </span>
                {chiesti > 0 && (
                  <Link className="muted" to="/impostazioni/presenza">
                    {chiesti === 1
                      ? "1 richiesta in attesa"
                      : `${String(chiesti)} richieste in attesa`}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {nota !== undefined && <Alert>{nota}</Alert>}

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
                      : `Da un'istanza che si identifica con ${row.instanceKey.slice(0, 16)}… — quel nome lo dichiara lei`}
                  </span>
                </span>
                <span className="row__end">
                  <Button onClick={() => void agisci(() => api.acceptFollower(token, row.id))}>
                    Accetta
                  </Button>
                  <Button
                    onClick={() => void agisci(() => api.removeFollower(token, row.id))}
                    variant="secondary"
                  >
                    Rifiuta
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        {!caricato && (
          <div className="card card--flush">
            <SkeletonPost />
          </div>
        )}

        {caricato && posts.length === 0 && persona !== undefined && (
          <div className="card">
            <EmptyState
              icon={modo === "istanza" ? "home" : "globe"}
              title={
                modo === "istanza"
                  ? "Non ha ancora scritto qui"
                  : persona.relazione === "sei_tu"
                    ? "Non hai ancora scritto nella rete"
                    : "Niente da leggere, per ora"
              }
            >
              {modo === "rete" && persona.relazione === "nessuna" && (
                <p>
                  I post di rete li vede chi è stato accettato. Se ti accetta, compariranno qui.
                </p>
              )}
            </EmptyState>
          </div>
        )}

        {posts.length > 0 && (
          <div className="card card--flush feed">
            {posts.map((post) => (
              <PostCard key={post.id} onChanged={carica} post={post} />
            ))}
          </div>
        )}

        {cursor !== undefined && (
          <div className="center">
            <Button onClick={() => void ancora()} variant="secondary">
              Mostra altri messaggi
            </Button>
          </div>
        )}

        {persona?.relazione === "sei_tu" && user.username === persona.username && (
          <p className="muted center">
            Questo è quello che gli altri vedono di te. Le impostazioni stanno{" "}
            <Link to="/impostazioni">nelle impostazioni</Link>.
          </p>
        )}
      </main>
    </>
  );
}
