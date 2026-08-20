import {
  COMMENT_MAX_LENGTH,
  type CommentView,
  type PostImageView,
  type PostView,
} from "@estia/contracts";
import { useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { quandoBreve, quandoPerEsteso } from "../tempo.js";
import { Avatar, Badge, Button, Icon, IconButton, Sheet } from "../ui/index.js";
import { MediaImage } from "./MediaImage.js";

export interface PostCardProps {
  post: PostView;
  onChanged: () => void | Promise<void>;
}

export function PostCard({ post, onChanged }: PostCardProps): React.ReactElement {
  const { token, user } = useSignedIn();
  const [comments, setComments] = useState<CommentView[] | undefined>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [aperta, setAperta] = useState<PostImageView | undefined>();
  const [azioni, setAzioni] = useState(false);

  /*
   * Il like si accende prima che l'istanza risponda, e si spegne se la risposta
   * non arriva. Su una rete di casa la chiamata dura pochi millisecondi, ma
   * un'interfaccia che aspetta comunque sembra lenta: qui l'unica cosa in gioco
   * è un cuore, e il costo di sbagliare è rimetterlo com'era.
   */
  const [likeLocale, setLikeLocale] = useState<{ liked: boolean; count: number } | undefined>();
  const liked = likeLocale?.liked ?? post.liked;
  const likeCount = likeLocale?.count ?? post.likeCount;

  const caricaCommenti = async (): Promise<void> => {
    setComments((await api.comments(token, post.id)).comments);
  };

  const mostraCommenti = async (): Promise<void> => {
    if (comments === undefined) {
      await caricaCommenti();
      return;
    }

    setComments(undefined);
  };

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

  const commenta = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);

    try {
      await api.addComment(token, post.id, { body: draft });
      setDraft("");
      await Promise.all([caricaCommenti(), onChanged()]);
    } finally {
      setBusy(false);
    }
  };

  const elimina = async (): Promise<void> => {
    setAzioni(false);
    await api.deletePost(token, post.id);
    await onChanged();
  };

  const nascondi = async (): Promise<void> => {
    setAzioni(false);
    await api.setPostHidden(token, post.id, !post.hidden);
    await onChanged();
  };

  return (
    <article className="post">
      <Avatar displayName={post.author.displayName} size="md" username={post.author.username} />

      <div className="post__main">
        <header className="post__head">
          <span className="post__author">{post.author.displayName}</span>
          <span className="post__handle">@{post.author.username}</span>
          <span className="post__handle">·</span>
          <time
            className="post__time"
            dateTime={post.createdAt}
            title={quandoPerEsteso(post.createdAt)}
          >
            {quandoBreve(post.createdAt)}
          </time>
          {post.editedAt !== null && <span className="post__note">modificato</span>}
          {/* La lente dice già dove sei; l'etichetta dice che cosa è questo
              post, ed è la terza difesa contro il pubblicare al pubblico
              sbagliato. */}
          {post.scope !== "local" && <Badge tone="on">Rete</Badge>}
          <span className="grow" />
          {(post.canDelete || post.canModerate) && (
            <IconButton
              icon="more"
              label={`Altre azioni sul messaggio di ${post.author.displayName}`}
              onClick={() => setAzioni(true)}
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

        {post.body !== "" && <p className="post__body">{post.body}</p>}

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
            aria-expanded={comments !== undefined}
            className="post__action"
            onClick={() => void mostraCommenti()}
            type="button"
          >
            <Icon name="comment" size={19} />
            {post.commentCount === 1 ? "1 commento" : `${String(post.commentCount)} commenti`}
          </button>
        </div>

        {comments !== undefined && (
          <div className="post__comments">
            {comments.length === 0 && <p className="muted">Ancora nessun commento.</p>}

            {comments.map((comment) => (
              <div className="comment" key={comment.id}>
                <Avatar
                  displayName={comment.author.displayName}
                  size="sm"
                  username={comment.author.username}
                />
                <div className="comment__body">
                  <span className="post__author">{comment.author.displayName}</span>{" "}
                  <time
                    className="post__time"
                    dateTime={comment.createdAt}
                    title={quandoPerEsteso(comment.createdAt)}
                  >
                    {quandoBreve(comment.createdAt)}
                  </time>
                  <div>
                    {comment.hidden && comment.body === "" ? (
                      <span className="muted">Commento nascosto da un moderatore.</span>
                    ) : (
                      comment.body
                    )}
                  </div>
                </div>
                {comment.canDelete && (
                  <IconButton
                    icon="close"
                    label="Elimina il commento"
                    onClick={() =>
                      void api
                        .deleteComment(token, comment.id)
                        .then(() => Promise.all([caricaCommenti(), onChanged()]))
                    }
                  />
                )}
              </div>
            ))}

            <form className="cluster" onSubmit={(event) => void commenta(event)}>
              <input
                aria-label={`Commenta il messaggio di ${post.author.displayName}`}
                className="input grow"
                maxLength={COMMENT_MAX_LENGTH}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={`Rispondi a ${
                  user.username === post.author.username ? "te stesso" : post.author.displayName
                }…`}
                value={draft}
              />
              <Button disabled={busy || draft.trim().length === 0} type="submit">
                Invia
              </Button>
            </form>
          </div>
        )}
      </div>

      {/*
        Moderare ed eliminare stanno dietro un gesto in più di proposito: sono
        le due azioni irreversibili della scheda, e a portata di pollice
        accanto al «mi piace» si premono per sbaglio.
      */}
      <Sheet onClose={() => setAzioni(false)} open={azioni} title="Altre azioni">
        <div className="stack--tight">
          {post.canModerate && (
            <Button block onClick={() => void nascondi()} variant="secondary">
              {post.hidden ? "Mostra di nuovo" : "Nascondi a tutti"}
            </Button>
          )}
          {post.canDelete && (
            <Button block onClick={() => void elimina()} variant="danger">
              Elimina il messaggio
            </Button>
          )}
          <p className="muted">
            Un messaggio eliminato sparisce da questa istanza e non è recuperabile.
          </p>
        </div>
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
          {/* L'immagine intera, che è quella che il browser ha compresso prima
              di caricarla: non esiste nessun originale più grande. */}
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
