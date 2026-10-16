import type { FollowsView, PersonView, PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";

import { api } from "../api.js";
import { ScreenHead } from "../app/ScreenHead.js";
import { PersonLink } from "../components/PersonLink.js";
import { PostCard } from "../components/PostCard.js";
import { spiega } from "../errori.js";
import { t, useT } from "../lingua.js";
import { useSignedIn } from "../state.js";
import { Alert, Avatar, Button, EmptyState, Live, Sheet, SkeletonPost } from "../ui/index.js";
import { meseEAnno as daQuando } from "../tempo.js";

function presenzaBreve(presenza: string): string {
  switch (presenza) {
    case "non_presente":
      return t("presenza.breve.non_presente");
    case "presente_privato":
      return t("presenza.breve.presente_privato");
    case "presente_pubblico":
      return t("presenza.breve.presente_pubblico");
    default:
      return "";
  }
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
  const { tn, tc, tcn } = useT();
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
      setErrore(t("profilo.errore"));
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
    setLavoro({ detto: t("profilo.carico_altri"), id: "ancora" });

    try {
      const pagina =
        remoto && instanceKey !== undefined
          ? await api.remotePersonPosts(token, instanceKey, username, { cursor })
          : await api.personPosts(token, username, { cursor, feed });

      setPosts((correnti) => [...correnti, ...pagina.posts]);
      setCursor(pagina.nextCursor);
    } catch (causa) {
      setErrore(spiega(causa, t("profilo.errore_altri")));
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
      setErrore(spiega(causa, t("comune.non_ha_funzionato")));
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
        t("profilo.smetto"),
        () => api.unfollow(token, riga.id),
        t("profilo.non_la_segui"),
      );
    }
  };

  const attivaLettura = async (): Promise<void> => {
    if (instanceKey === undefined) {
      return;
    }

    await agisci(
      "lettura",
      t("profilo.attivo_lettura"),
      () => api.follow(token, { instanceKey, username }),
      t("profilo.lettura_attivata"),
    );
  };

  const azione = (chi: PersonView): React.ReactElement => {
    switch (chi.relazione) {
      case "sei_tu":
        return (
          <Link className="btn btn--secondary" to="/modifica-profilo">
            {t("profilo.modifica")}
          </Link>
        );
      case "seguito":
        if (remoto && chi.leggibile === false) {
          return (
            <div className="cluster">
              <Button disabled={occupato} onClick={() => void attivaLettura()} variant="secondary">
                {lavoro?.id === "lettura"
                  ? t("profilo.attivo_lettura")
                  : t("profilo.attiva_lettura")}
              </Button>
              <Button disabled={occupato} onClick={() => void smetti()} variant="secondary">
                {lavoro?.id === "smetti" ? t("profilo.smetto_breve") : t("profilo.smetti")}
              </Button>
            </div>
          );
        }

        return (
          <Button disabled={occupato} onClick={() => void smetti()} variant="secondary">
            {lavoro?.id === "smetti" ? t("profilo.smetto_breve") : t("profilo.smetti")}
          </Button>
        );
      case "in_attesa":
        return (
          <Button disabled variant="secondary">
            {t("profilo.richiesta_in_attesa")}
          </Button>
        );
      case "nessuna":
        return (
          <Button
            disabled={occupato}
            onClick={() =>
              void agisci(
                "segui",
                t("profilo.mando_richiesta"),
                () =>
                  api.follow(token, {
                    instanceKey: remoto ? instanceKey! : "locale",
                    username,
                  }),
                t("profilo.richiesta_mandata"),
              )
            }
          >
            {lavoro?.id === "segui" ? t("profilo.mando_richiesta") : t("profilo.segui")}
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
      ? tn("profilo.seguiti", follows?.following.length ?? 0)
      : tn("profilo.follower", followerAccettati.length);

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
                {t("profilo.da_casa", {
                  casa:
                    persona.remoto.istanza === ""
                      ? `${persona.remoto.instanceKey.slice(0, 10)}…`
                      : persona.remoto.istanza,
                })}
              </div>
            )}

            {persona.bio !== "" && <p className="persona__bio">{persona.bio}</p>}

            {!remoto && persona.createdAt !== "" && (
              <div className="muted">
                {t("profilo.da_quando", { quando: daQuando(persona.createdAt) })}
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
                      {tcn("profilo.segue", persona.followingCount, {
                        n: <strong>{persona.followingCount}</strong>,
                      })}
                    </button>
                    <button
                      className="persona__conto"
                      onClick={() => setElencoAperto("followers")}
                      type="button"
                    >
                      {tcn("profilo.follower", persona.followerCount, {
                        n: <strong>{persona.followerCount}</strong>,
                      })}
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      {tcn("profilo.segue", persona.followingCount, {
                        n: <strong>{persona.followingCount}</strong>,
                      })}
                    </span>
                    <span>
                      {tcn("profilo.follower", persona.followerCount, {
                        n: <strong>{persona.followerCount}</strong>,
                      })}
                    </span>
                  </>
                )}
                {chiesti > 0 && (
                  <Link className="muted" to="/impostazioni/presenza">
                    {tn("profilo.richieste_in_attesa", chiesti)}
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
              {t("profilo.mancante", {
                casa: mancante === "" ? t("profilo.quell_istanza") : mancante,
              })}
            </Alert>
          </div>
        )}

        {inAttesa.length > 0 && (
          <div className="list-block">
            <h2 className="gruppo feed-pad">{t("profilo.vogliono_seguirti")}</h2>
            {inAttesa.map((row) => (
              <div className="row" key={row.id}>
                <span className="row__body">
                  <span className="row__title">@{row.username}</span>
                  <span className="row__note">
                    {row.instanceKey === "locale"
                      ? t("profilo.da_questa_istanza")
                      : t("profilo.da_altra_istanza", { chiave: row.instanceKey.slice(0, 16) })}
                  </span>
                </span>
                <span className="row__end">
                  <Button
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `accetta:${row.id}`,
                        t("profilo.accetto"),
                        () => api.acceptFollower(token, row.id),
                        t("profilo.ora_ti_segue", { utente: row.username }),
                      )
                    }
                  >
                    {lavoro?.id === `accetta:${row.id}`
                      ? t("profilo.accetto")
                      : t("profilo.accetta")}
                  </Button>
                  <Button
                    disabled={occupato}
                    onClick={() =>
                      void agisci(
                        `rifiuta:${row.id}`,
                        t("profilo.rifiuto"),
                        () => api.removeFollower(token, row.id),
                        t("profilo.richiesta_rifiutata"),
                      )
                    }
                    variant="secondary"
                  >
                    {lavoro?.id === `rifiuta:${row.id}`
                      ? t("profilo.rifiuto")
                      : t("profilo.rifiuta")}
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
                    ? t("profilo.vuoto.chiedi")
                    : persona.leggibile === false
                      ? t("profilo.vuoto.lettura_non_attiva")
                      : t("profilo.vuoto.niente")
                  : modo === "istanza"
                    ? persona.relazione === "nessuna" && persona.pubblico !== true
                      ? t("profilo.vuoto.chiedi")
                      : t("profilo.vuoto.non_ha_scritto")
                    : persona.relazione === "sei_tu"
                      ? t("profilo.vuoto.tu_rete")
                      : persona.relazione === "nessuna" && persona.pubblico !== true
                        ? t("profilo.vuoto.chiedi")
                        : t("profilo.vuoto.niente")
              }
            >
              {remoto && persona.relazione === "nessuna" && persona.pubblico !== true && (
                <p>{t("profilo.vuoto.privato_remoto")}</p>
              )}
              {remoto && persona.leggibile === false && <p>{t("profilo.vuoto.prova_mancante")}</p>}
              {!remoto && persona.relazione === "nessuna" && persona.pubblico !== true && (
                <p>{t("profilo.vuoto.privato_locale")}</p>
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
              {lavoro?.id === "ancora" ? t("comune.carico") : t("feed.altri")}
            </Button>
          </div>
        )}

        {persona?.relazione === "sei_tu" && user.username === persona.username && (
          <p className="muted center feed-pad">
            {tc("profilo.tuo", {
              menu: <Link to="/impostazioni">{t("profilo.menu")}</Link>,
              modifica: <Link to="/modifica-profilo">{t("profilo.modifica")}</Link>,
            })}
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
              <p className="empty-inline">{t("profilo.non_segui_nessuno")}</p>
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
                        ? t("profilo.su_questa_istanza")
                        : t("profilo.su_altra_istanza")}
                      {row.state === "in_attesa"
                        ? t("profilo.in_attesa")
                        : row.leggibile === false
                          ? t("profilo.lettura_non_attiva")
                          : ""}
                    </span>
                  </span>
                </PersonLink>
              ))
            ))}

          {elencoAperto === "followers" &&
            (followerAccettati.length === 0 ? (
              <p className="empty-inline">{t("profilo.nessuno_ti_segue")}</p>
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
                        ? t("profilo.su_questa_istanza")
                        : t("profilo.su_altra_istanza")}
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
