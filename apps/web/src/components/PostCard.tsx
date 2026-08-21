import { type CommentView, type PostView } from "@estia/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useRegisterThreadBack } from "../app/thread-nav.js";
import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { quandoBreve, quandoPerEsteso } from "../tempo.js";
import { Avatar, Badge, Button, Icon, IconButton, Sheet } from "../ui/index.js";
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
   * non ha azioni: cuori e risposte vivono sulla macchina di chi ha scritto, e
   * un pulsante che non fa niente è peggio di un pulsante che manca. Quello che
   * ha, e che va detto, è **da quale casa arriva**.
   */
  const remoto = post.remoto;
  const [comments, setComments] = useState<CommentView[] | undefined>();
  const [commentiErrore, setCommentiErrore] = useState<string | undefined>();
  const [lightboxId, setLightboxId] = useState<string | undefined>();
  const [azioni, setAzioni] = useState<"menu" | "elimina" | false>(false);
  const [likeLocale, setLikeLocale] = useState<{ liked: boolean; count: number } | undefined>();
  const liked = likeLocale?.liked ?? post.liked;
  const likeCount = likeLocale?.count ?? post.likeCount;

  const caricaCommenti = async (): Promise<void> => {
    setCommentiErrore(undefined);
    setComments((await api.comments(token, post.id)).comments);
  };

  useEffect(() => {
    if (dettaglio) {
      let vivo = true;

      void api
        .comments(token, post.id)
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

    void api
      .comments(token, post.id)
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
  }, [dettaglio, post.commentCount, post.id, token]);

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

  const cambiaLike = async (): Promise<void> => {
    const prossimo = !liked;

    setLikeLocale({ count: likeCount + (prossimo ? 1 : -1), liked: prossimo });

    try {
      await api.setLike(token, post.id, prossimo);
      await onChanged();
      setLikeLocale(undefined);
    } catch {
      setLikeLocale(undefined);
    }
  };

  const elimina = async (): Promise<void> => {
    setAzioni(false);
    await api.deletePost(token, post.id);
    await onChanged();

    if (dettaglio) {
      void navigate("/");
    }
  };

  const nascondi = async (): Promise<void> => {
    setAzioni(false);
    await api.setPostHidden(token, post.id, !post.hidden);
    await onChanged();
  };

  const apriDettaglio = (): void => {
    if (!dettaglio) {
      void navigate(`/p/${post.id}`);
    }
  };

  const apriCommento = (comment: CommentView): void => {
    void navigate(`/p/${post.id}/c/${comment.id}`);
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
            {dettaglio || remoto !== undefined ? (
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
                to={`/p/${post.id}`}
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
              className={
                dettaglio || remoto !== undefined ? "post__body" : "post__body post__body--link"
              }
              onClick={dettaglio || remoto !== undefined ? undefined : apriDettaglio}
              onKeyDown={
                dettaglio || remoto !== undefined
                  ? undefined
                  : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        apriDettaglio();
                      }
                    }
              }
              role={dettaglio || remoto !== undefined ? undefined : "link"}
              tabIndex={dettaglio || remoto !== undefined ? undefined : 0}
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

          {/* Nessuna azione su un post di un'altra casa: il cuore e la
              risposta stanno dove sta il post, e questa versione non ha un modo
              di spedirli. Un pulsante spento sarebbe una promessa mancata a
              ogni tocco. */}
          {remoto === undefined && (
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

                  void navigate(`/p/${post.id}`);
                }}
                type="button"
              >
                <Icon name="comment" size={19} />
                {post.commentCount > 0 && post.commentCount}
              </button>
            </div>
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
          postId={post.id}
          replyToId={focusCommentId ?? null}
        />
      )}

      <Sheet
        onClose={() => setAzioni(false)}
        open={azioni !== false}
        title={azioni === "elimina" ? "Eliminare questo messaggio?" : "Altre azioni"}
      >
        {azioni === "menu" && (
          <div className="stack--tight">
            {post.canModerate && (
              <Button block onClick={() => void nascondi()} variant="secondary">
                {post.hidden ? "Mostra di nuovo" : "Nascondi a tutti"}
              </Button>
            )}
            {post.canDelete && (
              <Button block onClick={() => setAzioni("elimina")} variant="danger">
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
            <Button block onClick={() => void elimina()} variant="danger">
              Sì, elimina
            </Button>
            <Button block onClick={() => setAzioni("menu")} variant="secondary">
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

            void navigate(`/p/${post.id}`);
          }}
          onLike={() => void cambiaLike()}
          showActions={remoto === undefined}
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
