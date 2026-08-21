import type { FollowsView, PersonView, PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { api } from "../api.js";
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
 * La pagina di una persona: quello che gli altri vedono di te — o di qualcuno
 * di un'altra casa ([ADR 0023]).
 *
 * Non è un modulo di configurazione — quello sta nelle impostazioni. Qui c'è
 * chi sei, chi ti segue, e i tuoi post **nella lente corrente** (in casa) oppure
 * la bacheca visitata (fuori). Le due non si mescolano.
 */
export function Profilo(): React.ReactElement {
  const { handle, instanceKey, username: usernameParam } = useParams();
  const { modo, token, user } = useSignedIn();
  const feed = modo === "istanza" ? "locale" : "seguiti";
  const remoto = instanceKey !== undefined;
  const username = remoto
    ? usernameParam
    : handle?.startsWith("@") === true
      ? handle.slice(1)
      : undefined;

  const [persona, setPersona] = useState<PersonView | undefined>();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [mancante, setMancante] = useState<string | undefined>();
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
    setMancante(undefined);

    try {
      if (remoto && instanceKey !== undefined) {
        const [chi, pagina, relazioni] = await Promise.all([
          api.remotePerson(token, instanceKey, username),
          api.remotePersonPosts(token, instanceKey, username),
          api.follows(token),
        ]);

        setPersona(chi);
        setPosts(pagina.posts);
        setCursor(pagina.nextCursor);
        setFollows(relazioni);
        setMancante(pagina.mancanti?.[0]?.istanza);
      } else {
        const [chi, pagina, relazioni] = await Promise.all([
          api.person(token, username),
          api.personPosts(token, username, { feed }),
          api.follows(token),
        ]);

        setPersona(chi);
        setPosts(pagina.posts);
        setCursor(pagina.nextCursor);
        setFollows(relazioni);
      }
    } catch {
      setErrore("Questo profilo non esiste, o non riesco a leggerlo.");
    } finally {
      setCaricato(true);
    }
  }, [feed, instanceKey, remoto, token, username]);

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

    if (remoto && instanceKey !== undefined) {
      const pagina = await api.remotePersonPosts(token, instanceKey, username, { cursor });

      setPosts((correnti) => [...correnti, ...pagina.posts]);
      setCursor(pagina.nextCursor);
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
    const chiave = remoto ? instanceKey! : "locale";
    const riga = follows?.following.find(
      (row) => row.username === username && row.instanceKey === chiave,
    );

    if (riga !== undefined) {
      await agisci(() => api.unfollow(token, riga.id), "Non la segui più.");
    }
  };

  const attivaLettura = async (): Promise<void> => {
    if (instanceKey === undefined) {
      return;
    }

    await agisci(
      () => api.follow(token, { instanceKey, username }),
      "Lettura attivata: se ti ha accettato, i post compariranno qui.",
    );
  };

  const azione = (chi: PersonView): React.ReactElement => {
    switch (chi.relazione) {
      case "sei_tu":
        return (
          <Link className="btn btn--secondary" to="/modifica-profilo">
            Modifica profilo
          </Link>
        );
      case "seguito":
        if (remoto && chi.leggibile === false) {
          return (
            <div className="cluster">
              <Button onClick={() => void attivaLettura()} variant="secondary">
                Attiva la lettura
              </Button>
              <Button onClick={() => void smetti()} variant="secondary">
                Smetti di seguire
              </Button>
            </div>
          );
        }

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
                () =>
                  api.follow(token, {
                    instanceKey: remoto ? instanceKey! : "locale",
                    username,
                  }),
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
    !remoto && persona?.relazione === "sei_tu"
      ? (follows?.followers.filter((row) => row.state === "in_attesa") ?? [])
      : [];

  const chiesti =
    !remoto && persona?.relazione === "sei_tu"
      ? (follows?.following.filter((row) => row.state === "in_attesa").length ?? 0)
      : 0;

  return (
    <>
      {persona !== undefined && persona.relazione !== "sei_tu" && (
        <ScreenHead back backTo="/cerca" title={persona.displayName} />
      )}

      <main className="column column--feed">
        {errore !== undefined && (
          <div className="feed-pad">
            <Alert tone="error">{errore}</Alert>
          </div>
        )}

        {persona !== undefined && (
          <div className="persona-shell">
            <div className={`copertina copertina--c${String(persona.username.length % 6)}`} />

            <div className="persona">
              <div className="persona__testa">
                <Avatar displayName={persona.displayName} size="xl" username={persona.username} />
                <span className="grow" />
                {azione(persona)}
              </div>

              <h2 className="persona__nome">{persona.displayName}</h2>
              <div className="muted">@{persona.username}</div>

              {persona.remoto !== undefined && (
                <div className="muted">
                  da{" "}
                  {persona.remoto.istanza === ""
                    ? `${persona.remoto.instanceKey.slice(0, 10)}…`
                    : persona.remoto.istanza}
                </div>
              )}

              {persona.bio !== "" && <p className="persona__bio">{persona.bio}</p>}

              {!remoto && persona.createdAt !== "" && (
                <div className="muted">
                  Su questa istanza da {daQuando(persona.createdAt)}
                  {persona.presence !== undefined && ` · ${PRESENZA_BREVE[persona.presence] ?? ""}`}
                </div>
              )}

              {!remoto && (
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
              )}
            </div>
          </div>
        )}

        {nota !== undefined && (
          <div className="feed-pad">
            <Alert>{nota}</Alert>
          </div>
        )}

        {mancante !== undefined && (
          <div className="feed-pad">
            <Alert>
              Non riesco a raggiungere {mancante === "" ? "quell'istanza" : mancante} in questo
              momento: i post di questa persona mancano, non sono assenti.
            </Alert>
          </div>
        )}

        {inAttesa.length > 0 && (
          <div className="list-block">
            <h2 className="gruppo feed-pad">Vogliono seguirti</h2>
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

        {!caricato && posts.length === 0 && (
          <div className="feed">
            <SkeletonPost />
          </div>
        )}

        {caricato && posts.length === 0 && persona !== undefined && mancante === undefined && (
          <div className="feed-pad">
            <EmptyState
              icon={remoto || modo === "rete" ? "globe" : "home"}
              title={
                remoto
                  ? persona.relazione === "nessuna"
                    ? "Seguila per leggere i suoi post"
                    : persona.leggibile === false
                      ? "Lo segui, ma la lettura non è attiva"
                      : "Niente da leggere, per ora"
                  : modo === "istanza"
                    ? "Non ha ancora scritto qui"
                    : persona.relazione === "sei_tu"
                      ? "Non hai ancora scritto nella rete"
                      : "Niente da leggere, per ora"
              }
            >
              {remoto && persona.relazione === "nessuna" && (
                <p>
                  I post restano sulla sua istanza. Se ti accetta, li vedrai qui quando la visiti —
                  non ne arriva una copia.
                </p>
              )}
              {remoto && persona.leggibile === false && (
                <p>
                  La relazione c&apos;è; manca la prova che apre la bacheca. «Attiva la lettura» la
                  richiede.
                </p>
              )}
              {!remoto && modo === "rete" && persona.relazione === "nessuna" && (
                <p>
                  I post di rete li vede chi è stato accettato. Se ti accetta, compariranno qui.
                </p>
              )}
            </EmptyState>
          </div>
        )}

        {posts.length > 0 && (
          <div className={caricato ? "feed" : "feed feed--attesa"}>
            {posts.map((post) => (
              <PostCard key={post.id} onChanged={carica} post={post} />
            ))}
          </div>
        )}

        {cursor !== undefined && (
          <div className="center feed-pad">
            <Button onClick={() => void ancora()} variant="secondary">
              Mostra altri messaggi
            </Button>
          </div>
        )}

        {persona?.relazione === "sei_tu" && user.username === persona.username && (
          <p className="muted center feed-pad">
            Questo è quello che gli altri vedono di te. Per cambiarlo:{" "}
            <Link to="/modifica-profilo">Modifica profilo</Link>. Dispositivi e istanza stanno nel{" "}
            <Link to="/impostazioni">menù</Link>.
          </p>
        )}
      </main>
    </>
  );
}
