import { type CommentView, type PostImageView, type PostView } from "@estia/contracts";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { quandoBreve, quandoPerEsteso } from "../tempo.js";
import { Avatar, Badge, Button, Icon, IconButton, Sheet } from "../ui/index.js";
import { CommentThread } from "./CommentThread.js";
import { MediaImage } from "./MediaImage.js";

export interface PostCardProps {
  post: PostView;
  onChanged: () => void | Promise<void>;
  /** Feed: apre la pagina del post. Dettaglio: commenti aperti sotto. */
  variant?: "feed" | "detail";
}

export function PostCard({ post, onChanged, variant = "feed" }: PostCardProps): React.ReactElement {
  const { token } = useSignedIn();
  const navigate = useNavigate();
  const dettaglio = variant === "detail";
  const [comments, setComments] = useState<CommentView[] | undefined>(
    dettaglio ? undefined : undefined,
  );
  const [commentiErrore, setCommentiErrore] = useState<string | undefined>();
  const [aperta, setAperta] = useState<PostImageView | undefined>();
  const [azioni, setAzioni] = useState<"menu" | "elimina" | false>(false);
  const [likeLocale, setLikeLocale] = useState<{ liked: boolean; count: number } | undefined>();
  const liked = likeLocale?.liked ?? post.liked;
  const likeCount = likeLocale?.count ?? post.likeCount;

  const caricaCommenti = async (): Promise<void> => {
    setCommentiErrore(undefined);
    setComments((await api.comments(token, post.id)).comments);
  };

  useEffect(() => {
    if (!dettaglio) {
      return;
    }

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
  }, [dettaglio, post.id, token]);

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

  return (
    <article className="post">
      <Avatar displayName={post.author.displayName} size="md" username={post.author.username} />

      <div className="post__main">
        <header className="post__head">
          <span className="post__author">{post.author.displayName}</span>
          <span className="post__handle">@{post.author.username}</span>
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
              to={`/p/${post.id}`}
            >
              <time dateTime={post.createdAt}>{quandoBreve(post.createdAt)}</time>
            </Link>
          )}
          {post.editedAt !== null && <span className="post__note">modificato</span>}
          {post.scope !== "local" && <Badge tone="on">Rete</Badge>}
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

        {post.images.length > 0 && (
          <div className={`gallery of-${String(Math.min(post.images.length, 4))}`}>
            {post.images.map((image) => (
              <MediaImage
                alt={
                  image.altText === ""
                    ? `Immagine pubblicata da ${post.author.displayName}`
                    : image.altText
                }
                height={image.thumbHeight}
                id={image.id}
                key={image.id}
                onClick={() => setAperta(image)}
                variant="thumbnail"
                width={image.thumbWidth}
              />
            ))}
          </div>
        )}

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

        {dettaglio && comments === undefined && commentiErrore === undefined && (
          <p className="muted post__comments">Carico i commenti…</p>
        )}

        {dettaglio && commentiErrore !== undefined && (
          <p className="muted post__comments">{commentiErrore}</p>
        )}

        {dettaglio && comments !== undefined && (
          <CommentThread
            comments={comments}
            onChanged={async () => {
              await Promise.all([caricaCommenti(), onChanged()]);
            }}
            postAuthorName={post.author.displayName}
            postId={post.id}
          />
        )}
      </div>

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

      {aperta !== undefined && (
        <div
          className="lightbox"
          onClick={() => setAperta(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setAperta(undefined);
            }
          }}
          role="presentation"
        >
          <MediaImage
            alt={
              aperta.altText === ""
                ? `Immagine pubblicata da ${post.author.displayName}`
                : aperta.altText
            }
            height={aperta.height}
            id={aperta.id}
            variant="original"
            width={aperta.width}
          />
          <Button onClick={() => setAperta(undefined)} variant="secondary">
            Chiudi
          </Button>
        </div>
      )}
    </article>
  );
}
