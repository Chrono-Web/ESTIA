import type { FollowsView, PersonView, PostView } from "@estia/contracts";
import type { PlainMessageKey } from "@estia/i18n";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { api } from "../api.js";
import { ScreenHead } from "../app/ScreenHead.js";
import { PersonLink } from "../components/PersonLink.js";
import { PostCard } from "../components/PostCard.js";
import { spiega } from "../errori.js";
import { formatoData, T, t } from "../i18n/index.js";
import { useSignedIn } from "../state.js";
import { Alert, Avatar, Button, EmptyState, Live, Sheet, SkeletonPost } from "../ui/index.js";

function daQuando(valore: string): string {
  return formatoData(valore, { month: "long", year: "numeric" });
}

/** Le chiavi, non le frasi: si traducono quando si disegna (ADR 0044). */
const PRESENZA_BREVE: Record<string, PlainMessageKey> = {
  non_presente: "profile.presence.not_present",
  presente_privato: "profile.presence.private",
  presente_pubblico: "profile.presence.public",
};

function presenzaBreve(presenza: string): string {
  const chiave = PRESENZA_BREVE[presenza];

  return chiave === undefined ? "" : t(chiave);
}

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
  const [elencoAperto, setElencoAperto] = useState<"followers" | "following" | undefined>();
  const [errore, setErrore] = useState<string | undefined>();
  const [nota, setNota] = useState<string | undefined>();
  const [caricato, setCaricato] = useState(false);
  /**
   * Quale azione sta lavorando, e come si chiama mentre lo fa.
   *
   * Qui serve più che altrove: seguire qualcuno di un'altra casa attraversa la
   * rete, e senza questo il pulsante sembra rotto (euristica 1). Tiene fuori
   * anche il secondo click sullo stesso gesto (euristica 5).
   */
  const [lavoro, setLavoro] = useState<{ id: string; detto: string } | undefined>();

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
      setErrore(t("profile.error.load"));
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

    setErrore(undefined);
    setLavoro({ detto: t("profile.posts.loading_more"), id: "ancora" });

    try {
      const pagina =
        remoto && instanceKey !== undefined
          ? await api.remotePersonPosts(token, instanceKey, username, { cursor })
          : await api.personPosts(token, username, { cursor, feed });

      setPosts((correnti) => [...correnti, ...pagina.posts]);
      setCursor(pagina.nextCursor);
    } catch (causa) {
      setErrore(spiega(causa, t("profile.posts.error_more")));
    } finally {
      setLavoro(undefined);
    }
  };

  const agisci = async (
    id: string,
    durante: string,
    azione: () => Promise<void>,
    detto?: string,
  ): Promise<void> => {
    setNota(undefined);
    setErrore(undefined);
    setLavoro({ detto: durante, id });

    try {
      await azione();
      await carica();
      setNota(detto);
    } catch (causa) {
      setErrore(spiega(causa, t("profile.actions.error")));
    } finally {
      setLavoro(undefined);
    }
  };

  const smetti = async (): Promise<void> => {
    const chiave = remoto ? instanceKey! : "locale";
    const riga = follows?.following.find(
      (row) => row.username === username && row.instanceKey === chiave,
    );

    if (riga !== undefined) {
      await agisci(
        "smetti",
        t("profile.actions.unfollowing"),
        () => api.unfollow(token, riga.id),
        t("profile.actions.unfollowed"),
      );
    }
  };

  const attivaLettura = async (): Promise<void> => {
    if (instanceKey === undefined) {
      return;
    }

    await agisci(
      "lettura",
      t("profile.actions.reading_enabling"),
      () => api.follow(token, { instanceKey, username }),
      t("profile.actions.reading_enabled"),
    );
  };

  const azione = (chi: PersonView): React.ReactElement => {
    switch (chi.relazione) {
      case "sei_tu":
        return (
          <Link className="btn btn--secondary" to="/modifica-profilo">
            {t("profile.actions.edit")}
          </Link>
        );
      case "seguito":
        if (remoto && chi.leggibile === false) {
          return (
            <div className="cluster">
              <Button disabled={occupato} onClick={() => void attivaLettura()} variant="secondary">
                {lavoro?.id === "lettura"
                  ? t("profile.actions.reading_enabling")
                  : t("profile.actions.reading_enable")}
              </Button>
              <Button disabled={occupato} onClick={() => void smetti()} variant="secondary">
                {lavoro?.id === "smetti"
                  ? t("profile.actions.unfollowing_short")
                  : t("profile.actions.unfollow")}
              </Button>
            </div>
          );
        }

        return (
          <Button disabled={occupato} onClick={() => void smetti()} variant="secondary">
            {lavoro?.id === "smetti"
              ? t("profile.actions.unfollowing_short")
              : t("profile.actions.unfollow")}
          </Button>
        );
      case "in_attesa":
        return (
          <Button disabled variant="secondary">
            {t("profile.actions.pending")}
          </Button>
        );
      case "nessuna":
        return (
          <Button
            disabled={occupato}
            onClick={() =>
              void agisci(
                "segui",
                t("profile.actions.requesting"),
                () =>
                  api.follow(token, {
                    instanceKey: remoto ? instanceKey! : "locale",
                    username,
                  }),
                t("profile.actions.request_sent"),
              )
            }
          >
            {lavoro?.id === "segui" ? t("profile.actions.requesting") : t("profile.actions.follow")}
          </Button>
        );
    }
  };

  const occupato = lavoro !== undefined;

  const inAttesa =
    !remoto && persona?.relazione === "sei_tu"
      ? (follows?.followers.filter((row) => row.state === "in_attesa") ?? [])
      : [];

  const chiesti =
    !remoto && persona?.relazione === "sei_tu"
      ? (follows?.following.filter((row) => row.state === "in_attesa").length ?? 0)
      : 0;

  const followerAccettati = follows?.followers.filter((row) => row.state === "accettato") ?? [];

  const titoloElenco =
    elencoAperto === "following"
      ? t("profile.list.following", { count: follows?.following.length ?? 0 })
      : t("profile.list.followers", { count: followerAccettati.length });

  return (
    <>
      {persona !== undefined && persona.relazione !== "sei_tu" && (
        <ScreenHead back backTo="/cerca" title={persona.displayName} />
      )}

      <main className="column column--feed">
        {/* Lo stato per chi non guarda lo schermo; l'errore lo annuncia il suo tono. */}
        <Live>{lavoro?.detto ?? nota ?? ""}</Live>

        {errore !== undefined && (
          <div className="feed-pad">
            <Alert tone="error">{errore}</Alert>
          </div>
        )}

        {persona !== undefined && (
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
                {t("profile.from", {
                  instance:
                    persona.remoto.istanza === ""
                      ? `${persona.remoto.instanceKey.slice(0, 10)}…`
                      : persona.remoto.istanza,
                })}
              </div>
            )}

            {persona.bio !== "" && <p className="persona__bio">{persona.bio}</p>}

            {!remoto && persona.createdAt !== "" && (
              <div className="muted">
                {t("profile.member_since", { date: daQuando(persona.createdAt) })}
                {persona.presence !== undefined && ` · ${presenzaBreve(persona.presence)}`}
              </div>
            )}

            {!remoto && (
              <div className="cluster persona__conti">
                {persona.relazione === "sei_tu" ? (
                  <>
                    <button
                      className="persona__conto"
                      onClick={() => setElencoAperto("following")}
                      type="button"
                    >
                      <T k="profile.counts.following" params={{ count: persona.followingCount }} />
                    </button>
                    <button
                      className="persona__conto"
                      onClick={() => setElencoAperto("followers")}
                      type="button"
                    >
                      <T k="profile.counts.followers" params={{ count: persona.followerCount }} />
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      <T k="profile.counts.following" params={{ count: persona.followingCount }} />
                    </span>
                    <span>
                      <T k="profile.counts.followers" params={{ count: persona.followerCount }} />
                    </span>
                  </>
                )}
                {chiesti > 0 && (
                  <Link className="muted" to="/impostazioni/presenza">
                    {t("profile.counts.requests_pending", { count: chiesti })}
                  </Link>
                )}
              </div>
            )}
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
              {mancante === ""
                ? t("profile.unreachable.unnamed")
                : t("profile.unreachable.named", { instance: mancante })}
            </Alert>
          </div>
        )}

        {inAttesa.length > 0 && (
          <div className="list-block">
            <h2 className="gruppo feed-pad">{t("profile.requests.title")}</h2>
            {inAttesa.map((row) => (
              <div className="row" key={row.id}>
                <span className="row__body">
                  <span className="row__title">@{row.username}</span>
                  <span className="row__note">
                    {row.instanceKey === "locale"
                      ? t("profile.requests.from_here")
                      : t("profile.requests.from_remote", { key: row.instanceKey.slice(0, 16) })}
                  </span>
                </span>
                <span className="row__end">
                  <Button
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `accetta:${row.id}`,
                        t("profile.requests.accepting"),
                        () => api.acceptFollower(token, row.id),
                        t("profile.requests.accepted", { username: row.username }),
                      )
                    }
                  >
                    {lavoro?.id === `accetta:${row.id}`
                      ? t("profile.requests.accepting")
                      : t("profile.requests.accept")}
                  </Button>
                  <Button
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `rifiuta:${row.id}`,
                        t("profile.requests.declining"),
                        () => api.removeFollower(token, row.id),
                        t("profile.requests.declined"),
                      )
                    }
                    variant="secondary"
                  >
                    {lavoro?.id === `rifiuta:${row.id}`
                      ? t("profile.requests.declining")
                      : t("profile.requests.decline")}
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
                  ? persona.relazione === "nessuna" && persona.pubblico !== true
                    ? t("profile.empty.ask_to_follow")
                    : persona.leggibile === false
                      ? t("profile.empty.reading_off")
                      : t("profile.empty.nothing_yet")
                  : modo === "istanza"
                    ? persona.relazione === "nessuna" && persona.pubblico !== true
                      ? t("profile.empty.ask_to_follow")
                      : t("profile.empty.not_written_here")
                    : persona.relazione === "sei_tu"
                      ? t("profile.empty.you_not_on_network")
                      : persona.relazione === "nessuna" && persona.pubblico !== true
                        ? t("profile.empty.ask_to_follow")
                        : t("profile.empty.nothing_yet")
              }
            >
              {remoto && persona.relazione === "nessuna" && persona.pubblico !== true && (
                <p>{t("profile.empty.private_remote")}</p>
              )}
              {remoto && persona.leggibile === false && (
                <p>{t("profile.empty.reading_off_body")}</p>
              )}
              {!remoto && persona.relazione === "nessuna" && persona.pubblico !== true && (
                <p>{t("profile.empty.private_local")}</p>
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
            <Button disabled={occupato} onClick={() => void ancora()} variant="secondary">
              {lavoro?.id === "ancora" ? t("profile.loading") : t("feed.home.more")}
            </Button>
          </div>
        )}

        {persona?.relazione === "sei_tu" && user.username === persona.username && (
          <p className="muted center feed-pad">
            <T
              k="profile.self_note"
              tags={{
                edit: (testo) => <Link to="/modifica-profilo">{testo}</Link>,
                menu: (testo) => <Link to="/impostazioni">{testo}</Link>,
              }}
            />
          </p>
        )}
      </main>

      {persona?.relazione === "sei_tu" && follows !== undefined && (
        <Sheet
          onClose={() => setElencoAperto(undefined)}
          open={elencoAperto !== undefined}
          title={titoloElenco}
          variant="centrato"
        >
          {elencoAperto === "following" &&
            (follows.following.length === 0 ? (
              <p className="empty-inline">{t("profile.list.empty_following")}</p>
            ) : (
              follows.following.map((row) => (
                <PersonLink
                  className="row"
                  instanceKey={row.instanceKey}
                  key={row.id}
                  onClick={() => setElencoAperto(undefined)}
                  username={row.username}
                >
                  <Avatar displayName={row.username} size="md" username={row.username} />
                  <span className="row__body">
                    <span className="row__title">@{row.username}</span>
                    <span className="row__note">
                      {row.instanceKey === "locale"
                        ? t("profile.list.here")
                        : t("profile.list.elsewhere")}
                      {row.state === "in_attesa"
                        ? ` · ${t("profile.list.pending")}`
                        : row.leggibile === false
                          ? ` · ${t("profile.list.reading_off")}`
                          : ""}
                    </span>
                  </span>
                </PersonLink>
              ))
            ))}

          {elencoAperto === "followers" &&
            (followerAccettati.length === 0 ? (
              <p className="empty-inline">{t("profile.list.empty_followers")}</p>
            ) : (
              followerAccettati.map((row) => (
                <PersonLink
                  className="row"
                  instanceKey={row.instanceKey}
                  key={row.id}
                  onClick={() => setElencoAperto(undefined)}
                  username={row.username}
                >
                  <Avatar displayName={row.username} size="md" username={row.username} />
                  <span className="row__body">
                    <span className="row__title">@{row.username}</span>
                    <span className="row__note">
                      {row.instanceKey === "locale"
                        ? t("profile.list.here")
                        : t("profile.list.elsewhere")}
                    </span>
                  </span>
                </PersonLink>
              ))
            ))}
        </Sheet>
      )}
    </>
  );
}
