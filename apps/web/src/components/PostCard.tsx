import { type CommentView, type PostView } from "@estia/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useRegisterThreadBack } from "../app/thread-nav.js";
import { api } from "../api.js";
import { spiega } from "../errori.js";
import { useSignedIn } from "../state.js";
import { quandoBreve, quandoPerEsteso } from "../tempo.js";
import { Alert, Avatar, Badge, Button, Icon, IconButton, Live, Sheet } from "../ui/index.js";
import { CommentItem } from "./CommentItem.js";
import { buildCommentChain, CommentThread } from "./CommentThread.js";
import { MediaImage } from "./MediaImage.js";
import { MediaLightbox } from "./MediaLightbox.js";
import { PersonLink } from "./PersonLink.js";

export interface PostCardProps {
  post: PostView;
  onChanged: () => void | Promise<void>;
  /** Feed: apre la pagina del post. Dettaglio: commenti sotto il separatore. */
  variant?: "feed" | "detail";
  /** Commento in evidenza sopra il separatore (`/p/:id/c/:commentId`). */
  focusCommentId?: string;
}

export function PostCard({
  post,
  onChanged,
  variant = "feed",
  focusCommentId,
}: PostCardProps): React.ReactElement {
  const { token } = useSignedIn();
  const navigate = useNavigate();
  const dettaglio = variant === "detail";
  /*
   * Un post che arriva da un'altra casa ([ADR 0023]).
   *
   * Non ha una pagina qui — il suo indirizzo non esiste su questa istanza — e
   * **le sue due assenze non sono più la stessa cosa** ([ADR 0025] §5): il
   * cuore attraversa, la risposta no. Un cuore è un fatto di una riga e si
   * revoca cancellandola; una risposta sono parole di qualcunə che non è
   * membro di questa istanza, ospitate qui, e apre la moderazione federata.
   *
   * Il cuore c'è solo se quella casa sa riceverlo: `cuoriDisponibili` è falso
   * quando parla una versione più vecchia del protocollo, e allora il pulsante
   * manca invece di fingere. Quello che il post ha sempre, e che va detto, è
   * **da quale casa arriva**.
   */
  const remoto = post.remoto;
  const [comments, setComments] = useState<CommentView[] | undefined>();
  const [commentiErrore, setCommentiErrore] = useState<string | undefined>();
  const [lightboxId, setLightboxId] = useState<string | undefined>();
  const [azioni, setAzioni] = useState<"menu" | "elimina" | false>(false);
  /**
   * Quale azione del menù sta lavorando, e che cosa dire se non riesce.
   *
   * Il pannello resta aperto finché non è finita: chiuderlo prima farebbe
   * sparire l'unico posto in cui un fallimento potrebbe farsi vedere.
   */
  const [azioneInCorso, setAzioneInCorso] = useState<"elimina" | "nascondi" | undefined>();
  const [azioneErrore, setAzioneErrore] = useState<string | undefined>();
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [likeLocale, setLikeLocale] = useState<{ liked: boolean; count: number } | undefined>();
  /** Solo per un cuore che doveva attraversare e non ce l'ha fatta. */
  const [cuoreErrore, setCuoreErrore] = useState<string | undefined>();
  const liked = likeLocale?.liked ?? post.liked;
  const likeCount = likeLocale?.count ?? post.likeCount;

  const caricaCommenti = async (): Promise<void> => {
    setCommentiErrore(undefined);
    if (remoto !== undefined) {
      setComments(
        (
          await api.remoteComments(
            token,
            { instanceKey: remoto.instanceKey, username: post.author.username },
            post.id,
          )
        ).comments,
      );
    } else {
      setComments((await api.comments(token, post.id)).comments);
    }
  };

  useEffect(() => {
    if (dettaglio) {
      let vivo = true;

      const fetchComments =
        remoto !== undefined
          ? api.remoteComments(
              token,
              { instanceKey: remoto.instanceKey, username: post.author.username },
              post.id,
            )
          : api.comments(token, post.id);

      void fetchComments
        .then((risposta) => {
          if (vivo) {
            setComments(risposta.comments);
            setCommentiErrore(undefined);
          }
        })
        .catch(() => {
          if (vivo) {
            setComments([]);
            setCommentiErrore("Non riesco a leggere i commenti.");
          }
        });

      return () => {
        vivo = false;
      };
    }

    if (post.commentCount === 0) {
      setComments(undefined);
      return;
    }

    let vivo = true;

    const fetchComments =
      remoto !== undefined
        ? api.remoteComments(
            token,
            { instanceKey: remoto.instanceKey, username: post.author.username },
            post.id,
          )
        : api.comments(token, post.id);

    void fetchComments
      .then((risposta) => {
        if (vivo) {
          setComments(risposta.comments);
        }
      })
      .catch(() => {
        if (vivo) {
          setComments([]);
        }
      });

    return () => {
      vivo = false;
    };
  }, [dettaglio, post.commentCount, post.id, token, remoto, post.author.username]);

  const focusChain = useMemo(() => {
    if (!dettaglio || focusCommentId === undefined || comments === undefined) {
      return [];
    }

    return buildCommentChain(comments, focusCommentId);
  }, [comments, dettaglio, focusCommentId]);

  const tornaNelThread = useCallback(() => {
    if (!dettaglio) {
      return;
    }

    if (focusCommentId !== undefined && comments !== undefined) {
      const focus = comments.find((c) => c.id === focusCommentId);
      const padreId = focus?.parentId ?? null;

      if (padreId !== null) {
        void navigate(`/p/${post.id}/c/${padreId}`, { replace: true });
        return;
      }

      void navigate(`/p/${post.id}`, { replace: true });
      return;
    }

    void navigate("/", { state: { focusPostId: post.id } });
  }, [comments, dettaglio, focusCommentId, navigate, post.id]);

  useRegisterThreadBack(dettaglio ? tornaNelThread : null);

  /**
   * Il cuore, di casa o attraverso la rete ([ADR 0025]).
   *
   * Si disegna subito e si corregge dopo, che è la reattività attesa da un
   * gesto così piccolo. La differenza sta nel fallimento: in casa un errore è
   * quasi sempre la sessione, e il ritorno silenzioso allo stato di prima dice
   * abbastanza; **fuori casa no**, perché la ragione più probabile è che quella
   * macchina sia spenta — e un cuore che torna vuoto senza una parola è
   * esattamente il limite taciuto da cui è nata M5.
   */
  const cambiaLike = async (): Promise<void> => {
    const prossimo = !liked;

    setCuoreErrore(undefined);
    setLikeLocale({ count: likeCount + (prossimo ? 1 : -1), liked: prossimo });

    try {
      if (remoto === undefined) {
        await api.setLike(token, post.id, prossimo);
      } else {
        const esito = await api.setRemoteLike(
          token,
          { instanceKey: remoto.instanceKey, username: post.author.username },
          post.id,
          prossimo,
        );

        // Il numero giusto lo conosce chi custodisce il post, non chi ha
        // premuto: si prende quello e non si somma a mano.
        setLikeLocale({ count: esito.likeCount, liked: esito.liked });
      }

      await onChanged();

      if (remoto === undefined) {
        setLikeLocale(undefined);
      }
    } catch (causa) {
      setLikeLocale(undefined);

      if (remoto !== undefined) {
        setCuoreErrore(spiega(causa, "Il cuore non è arrivato."));
      }
    }
  };

  const elimina = async (): Promise<void> => {
    setAzioneErrore(undefined);
    setAzioneInCorso("elimina");

    try {
      await api.deletePost(token, post.id);
      await onChanged();
      setAzioni(false);

      if (dettaglio) {
        void navigate("/");
      }
    } catch (causa) {
      setAzioneErrore(spiega(causa, "Non sono riuscito a eliminare il messaggio. Riprova."));
    } finally {
      setAzioneInCorso(undefined);
    }
  };

  const nascondi = async (): Promise<void> => {
    setAzioneErrore(undefined);
    setAzioneInCorso("nascondi");

    try {
      await api.setPostHidden(token, post.id, !post.hidden);
      await onChanged();
      setAzioni(false);
    } catch (causa) {
      setAzioneErrore(spiega(causa, "Non ha funzionato. Riprova."));
    } finally {
      setAzioneInCorso(undefined);
    }
  };

  const apriDettaglio = (): void => {
    if (!dettaglio) {
      if (remoto !== undefined) {
        void navigate(
          `/p/${encodeURIComponent(remoto.instanceKey)}/${encodeURIComponent(
            post.author.username,
          )}/${post.id}`,
        );
      } else {
        void navigate(`/p/${post.id}`);
      }
    }
  };

  const apriCommento = (comment: CommentView): void => {
    if (remoto !== undefined) {
      void navigate(
        `/p/${encodeURIComponent(remoto.instanceKey)}/${encodeURIComponent(
          post.author.username,
        )}/${post.id}/c/${comment.id}`,
      );
    } else {
      void navigate(`/p/${post.id}/c/${comment.id}`);
    }
  };

  const anteprimaSingola =
    !dettaglio && post.commentCount === 1 && comments !== undefined && comments.length >= 1
      ? comments[0]
      : undefined;
  const anteprimaMultipla = !dettaglio && post.commentCount >= 2;
  const primoAutore =
    anteprimaMultipla && comments !== undefined && comments.length > 0
      ? comments[0]!.author
      : undefined;

  // Feed: linea verso anteprima. Dettaglio con focus: linea verso la catena.
  // Dettaglio senza focus: nessuna linea (il separatore fa da confine).
  const lineaVersoCatena = dettaglio && focusChain.length > 0;
  const lineaFeed = Boolean(anteprimaSingola) || anteprimaMultipla;
  const avatarPost = dettaglio ? "lg" : "md";

  return (
    <article className="thread-unit" id={`post-${post.id}`}>
      <div
        className={
          dettaglio
            ? "thread-row thread-row--hero"
            : anteprimaMultipla
              ? "thread-row thread-row--to-more"
              : "thread-row"
        }
      >
        <div className="thread-rail">
          {remoto === undefined ? (
            <PersonLink className="avatar-link" username={post.author.username}>
              <Avatar
                displayName={post.author.displayName}
                size={avatarPost}
                username={post.author.username}
              />
            </PersonLink>
          ) : (
            <PersonLink
              className="avatar-link"
              instanceKey={remoto.instanceKey}
              username={post.author.username}
            >
              <Avatar
                displayName={post.author.displayName}
                size={avatarPost}
                username={post.author.username}
              />
            </PersonLink>
          )}
          {lineaVersoCatena && <span aria-hidden="true" className="thread-line" />}
          {lineaFeed && !anteprimaMultipla && <span aria-hidden="true" className="thread-line" />}
          {anteprimaMultipla && <span aria-hidden="true" className="thread-curve__stem" />}
        </div>

        <div className="thread-main">
          <header className="post__head">
            {remoto === undefined ? (
              <>
                <PersonLink className="post__author" username={post.author.username}>
                  {post.author.displayName}
                </PersonLink>
                <PersonLink className="post__handle" username={post.author.username}>
                  @{post.author.username}
                </PersonLink>
              </>
            ) : (
              <>
                <PersonLink
                  className="post__author"
                  instanceKey={remoto.instanceKey}
                  username={post.author.username}
                >
                  {post.author.displayName}
                </PersonLink>
                <PersonLink
                  className="post__handle"
                  instanceKey={remoto.instanceKey}
                  username={post.author.username}
                >
                  @{post.author.username}
                </PersonLink>
              </>
            )}
            <span className="post__handle">·</span>
            {dettaglio ? (
              <time
                className="post__time"
                dateTime={post.createdAt}
                title={quandoPerEsteso(post.createdAt)}
              >
                {quandoBreve(post.createdAt)}
              </time>
            ) : (
              <Link
                className="post__time"
                title={quandoPerEsteso(post.createdAt)}
                to={
                  remoto !== undefined
                    ? `/p/${encodeURIComponent(remoto.instanceKey)}/${encodeURIComponent(
                        post.author.username,
                      )}/${post.id}`
                    : `/p/${post.id}`
                }
              >
                <time dateTime={post.createdAt}>{quandoBreve(post.createdAt)}</time>
              </Link>
            )}
            {post.editedAt !== null && <span className="post__note">modificato</span>}
            {/* Il nome se lo dà quell'istanza, e l'unica cosa verificata di lei
                è la chiave (ADR 0020 §5): «da» e non «verificato da». */}
            {remoto !== undefined && (
              <Badge tone="on">
                da {remoto.istanza === "" ? `${remoto.instanceKey.slice(0, 10)}…` : remoto.istanza}
              </Badge>
            )}
            {remoto === undefined && post.scope !== "local" && <Badge tone="on">Rete</Badge>}
            <span className="grow" />
            {(post.canDelete || post.canModerate) && (
              <IconButton
                icon="more"
                label={`Altre azioni sul messaggio di ${post.author.displayName}`}
                onClick={() => setAzioni("menu")}
                ref={menuAnchor}
              />
            )}
          </header>

          {post.hidden && (
            <p className="post__note">
              {post.body === ""
                ? "Questo messaggio è stato nascosto da un moderatore."
                : "Nascosto da un moderatore — lo vedi perché è tuo o perché moderi."}
            </p>
          )}

          {post.body !== "" && (
            <p
              className={dettaglio ? "post__body" : "post__body post__body--link"}
              onClick={dettaglio ? undefined : apriDettaglio}
              onKeyDown={
                dettaglio
                  ? undefined
                  : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        apriDettaglio();
                      }
                    }
              }
              role={dettaglio ? undefined : "link"}
              tabIndex={dettaglio ? undefined : 0}
            >
              {post.body}
            </p>
          )}

          {/* Una versione più vecchia poteva mandare solo il conteggio: in quel
              caso le foto non ci sono e lo diciamo, invece di far sembrare il
              post senza immagini. Con i metadati, si mostrano come quelle di casa. */}
          {remoto !== undefined && remoto.immagini > 0 && post.images.length === 0 && (
            <p className="post__note">
              {remoto.immagini === 1
                ? "Una fotografia non è ancora disponibile da questa istanza"
                : `${String(remoto.immagini)} fotografie non sono ancora disponibili da questa istanza`}
              .
            </p>
          )}

          {post.images.length > 0 && (
            <div
              className={`gallery of-${String(Math.min(post.images.length, 4))}`}
              role={post.images.length > 1 ? "list" : undefined}
            >
              {post.images.map((image) => (
                <div
                  className="gallery__item"
                  key={image.id}
                  {...(post.images.length > 1 ? { role: "listitem" } : {})}
                >
                  <MediaImage
                    alt={
                      image.altText === ""
                        ? `Immagine pubblicata da ${post.author.displayName}`
                        : image.altText
                    }
                    height={image.thumbHeight}
                    id={image.id}
                    onClick={() => setLightboxId(image.id)}
                    variant="thumbnail"
                    width={image.thumbWidth}
                    {...(remoto === undefined
                      ? {}
                      : {
                          remoto: {
                            instanceKey: remoto.instanceKey,
                            utente: post.author.username,
                          },
                        })}
                  />
                </div>
              ))}
            </div>
          )}

          {/*
           * Il cuore c'è anche da fuori; la risposta no, e si vede.
           *
           * Un pulsante che manca accanto a uno che funziona si legge come una
           * scelta; due che mancano si leggevano come una funzione rotta.
           */}
          {(remoto === undefined || remoto.cuoriDisponibili) && (
            <div className="post__actions">
              <button
                aria-label={liked ? "Togli il mi piace" : "Metti mi piace"}
                aria-pressed={liked}
                className="post__action"
                onClick={() => void cambiaLike()}
                type="button"
              >
                <Icon name="heart" size={19} />
                {likeCount > 0 && likeCount}
              </button>

              <button
                aria-label={
                  post.commentCount === 1 ? "1 commento" : `${String(post.commentCount)} commenti`
                }
                className="post__action"
                onClick={() => {
                  if (dettaglio) {
                    document.getElementById("commento-nuovo")?.focus();
                    return;
                  }

                  if (remoto !== undefined) {
                    void navigate(
                      `/p/${encodeURIComponent(remoto.instanceKey)}/${encodeURIComponent(
                        post.author.username,
                      )}/${post.id}`,
                    );
                  } else {
                    void navigate(`/p/${post.id}`);
                  }
                }}
                type="button"
              >
                <Icon name="comment" size={19} />
                {post.commentCount > 0 && post.commentCount}
              </button>
            </div>
          )}

          {cuoreErrore !== undefined && (
            <p className="post__note" role="status">
              {cuoreErrore}
            </p>
          )}
        </div>
      </div>

      {anteprimaMultipla && (
        <div className="thread-more">
          <div className="thread-more__rail" aria-hidden="true">
            <span className="thread-curve__elbow" />
          </div>
          <button
            className="thread-more__hit"
            onClick={() => void navigate(`/p/${post.id}`)}
            type="button"
          >
            {primoAutore !== undefined && (
              <Avatar
                displayName={primoAutore.displayName}
                size="sm"
                username={primoAutore.username}
              />
            )}
            {`Mostra ${String(post.commentCount)} risposte`}
          </button>
        </div>
      )}

      {anteprimaSingola !== undefined && (
        <CommentItem
          comment={anteprimaSingola}
          onChanged={async () => {
            await Promise.all([caricaCommenti(), onChanged()]);
          }}
          onReply={() => {
            void navigate(`/p/${post.id}/c/${anteprimaSingola.id}`);
          }}
          postAuthorId={post.author.id}
          preview
          size="md"
        />
      )}

      {dettaglio &&
        focusChain.map((comment, index) => (
          <CommentItem
            comment={comment}
            key={comment.id}
            onChanged={async () => {
              await Promise.all([caricaCommenti(), onChanged()]);
            }}
            onReply={
              index === focusChain.length - 1
                ? () => {
                    document.getElementById("commento-nuovo")?.focus();
                  }
                : () => {
                    void navigate(`/p/${post.id}/c/${comment.id}`);
                  }
            }
            postAuthorId={post.author.id}
            {...(index < focusChain.length - 1 ? { rail: "line" as const } : {})}
            size="lg"
          />
        ))}

      {dettaglio && <hr className="post-divider" />}

      {dettaglio && comments === undefined && commentiErrore === undefined && (
        <p className="muted feed-pad">Carico i commenti…</p>
      )}

      {dettaglio && commentiErrore !== undefined && (
        <p className="muted feed-pad">{commentiErrore}</p>
      )}

      {dettaglio && comments !== undefined && (
        <CommentThread
          comments={comments}
          onChanged={async () => {
            await Promise.all([caricaCommenti(), onChanged()]);
          }}
          onOpenComment={apriCommento}
          onReplyComment={apriCommento}
          postAuthorId={post.author.id}
          postAuthorName={post.author.displayName}
          postAuthorUsername={post.author.username}
          postId={post.id}
          {...(remoto !== undefined ? { remoto } : {})}
          replyToId={focusCommentId ?? null}
        />
      )}

      <Sheet
        anchorRef={menuAnchor}
        onClose={() => {
          setAzioni(false);
          setAzioneErrore(undefined);
        }}
        open={azioni !== false}
        title={azioni === "elimina" ? "Eliminare questo messaggio?" : "Altre azioni"}
        variant="piccolo"
      >
        <Live>
          {azioneInCorso === "elimina"
            ? "Elimino il messaggio…"
            : azioneInCorso === "nascondi"
              ? "Cambio la visibilità…"
              : ""}
        </Live>

        {azioneErrore !== undefined && <Alert tone="error">{azioneErrore}</Alert>}

        {azioni === "menu" && (
          <div className="stack--tight">
            {post.canModerate && (
              <Button
                block
                disabled={azioneInCorso !== undefined}
                onClick={() => void nascondi()}
                variant="secondary"
              >
                {azioneInCorso === "nascondi"
                  ? "Cambio…"
                  : post.hidden
                    ? "Mostra di nuovo"
                    : "Nascondi a tutti"}
              </Button>
            )}
            {post.canDelete && (
              <Button
                block
                disabled={azioneInCorso !== undefined}
                onClick={() => setAzioni("elimina")}
                variant="danger"
              >
                Elimina il messaggio
              </Button>
            )}
          </div>
        )}
        {azioni === "elimina" && (
          <div className="stack--tight">
            <p className="muted">
              Un messaggio eliminato sparisce da questa istanza e non è recuperabile.
            </p>
            <Button
              block
              disabled={azioneInCorso !== undefined}
              onClick={() => void elimina()}
              variant="danger"
            >
              {azioneInCorso === "elimina" ? "Elimino…" : "Sì, elimina"}
            </Button>
            <Button
              block
              disabled={azioneInCorso !== undefined}
              onClick={() => setAzioni("menu")}
              variant="secondary"
            >
              Annulla
            </Button>
          </div>
        )}
      </Sheet>

      {lightboxId !== undefined && (
        <MediaLightbox
          authorName={post.author.displayName}
          commentCount={post.commentCount}
          images={post.images}
          initialId={lightboxId}
          likeCount={likeCount}
          liked={liked}
          onClose={() => setLightboxId(undefined)}
          onComment={() => {
            setLightboxId(undefined);

            if (dettaglio) {
              document.getElementById("commento-nuovo")?.focus();
              return;
            }

            if (remoto !== undefined) {
              void navigate(
                `/p/${encodeURIComponent(remoto.instanceKey)}/${encodeURIComponent(
                  post.author.username,
                )}/${post.id}`,
              );
            } else {
              void navigate(`/p/${post.id}`);
            }
          }}
          onLike={() => void cambiaLike()}
          showCommentAction={true}
          showLikeAction={remoto === undefined || remoto.cuoriDisponibili}
          {...(remoto === undefined
            ? {}
            : {
                remoto: {
                  instanceKey: remoto.instanceKey,
                  utente: post.author.username,
                },
              })}
        />
      )}
    </article>
  );
}
