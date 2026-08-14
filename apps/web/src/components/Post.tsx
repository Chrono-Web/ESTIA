import { COMMENT_MAX_LENGTH, type CommentView, type PostView } from "@estia/contracts";
import { useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";

function when(value: string): string {
  return new Date(value).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

export interface PostProps {
  post: PostView;
  onChanged: () => void | Promise<void>;
}

export function Post({ post, onChanged }: PostProps): React.ReactElement {
  const { token, user } = useSignedIn();
  const [comments, setComments] = useState<CommentView[] | undefined>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const loadComments = async (): Promise<void> => {
    setComments((await api.comments(token, post.id)).comments);
  };

  const toggleComments = async (): Promise<void> => {
    if (comments === undefined) {
      await loadComments();
      return;
    }

    setComments(undefined);
  };

  const toggleLike = async (): Promise<void> => {
    await api.setLike(token, post.id, !post.liked);
    await onChanged();
  };

  const send = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);

    try {
      await api.addComment(token, post.id, { body: draft });
      setDraft("");
      await Promise.all([loadComments(), onChanged()]);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    await api.deletePost(token, post.id);
    await onChanged();
  };

  const removeComment = async (comment: CommentView): Promise<void> => {
    await api.deleteComment(token, comment.id);
    await Promise.all([loadComments(), onChanged()]);
  };

  return (
    <article className="card">
      <header className="post-head">
        <div className="grow">
          <strong>{post.author.displayName}</strong>{" "}
          <span className="muted">@{post.author.username}</span>
          <div className="muted">
            {when(post.createdAt)}
            {post.editedAt !== null && <> · modificato</>}
            {post.scope !== "local" && (
              <>
                {" "}
                · <span className="badge">{post.scope === "public" ? "pubblico" : "follower"}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {post.hidden && (
        <p className="muted">
          {post.body === ""
            ? "Questo messaggio è stato nascosto da un moderatore."
            : "Nascosto da un moderatore — lo vedi perché è tuo o perché moderi."}
        </p>
      )}

      {post.body !== "" && <p className="post-body">{post.body}</p>}

      <div className="actions">
        <button
          className={post.liked ? "quiet liked" : "quiet"}
          onClick={() => void toggleLike()}
          type="button"
        >
          {post.liked ? "★" : "☆"} {post.likeCount}
        </button>

        <button className="quiet" onClick={() => void toggleComments()} type="button">
          {post.commentCount === 1 ? "1 commento" : `${post.commentCount} commenti`}
        </button>

        <span className="spacer" />

        {post.canModerate && (
          <button
            className="quiet"
            onClick={() => void api.setPostHidden(token, post.id, !post.hidden).then(onChanged)}
            type="button"
          >
            {post.hidden ? "Mostra" : "Nascondi"}
          </button>
        )}

        {post.canDelete && (
          <button className="danger" onClick={() => void remove()} type="button">
            Elimina
          </button>
        )}
      </div>

      {comments !== undefined && (
        <div className="comments">
          {comments.length === 0 && <p className="muted">Ancora nessun commento.</p>}

          {comments.map((comment) => (
            <div className="row" key={comment.id}>
              <div className="grow">
                <strong>{comment.author.displayName}</strong>{" "}
                <span className="muted">{when(comment.createdAt)}</span>
                <div>
                  {comment.hidden && comment.body === "" ? (
                    <span className="muted">Commento nascosto da un moderatore.</span>
                  ) : (
                    comment.body
                  )}
                </div>
              </div>
              {comment.canDelete && (
                <button
                  className="danger"
                  onClick={() => void removeComment(comment)}
                  type="button"
                >
                  Elimina
                </button>
              )}
            </div>
          ))}

          <form className="actions spaced" onSubmit={(event) => void send(event)}>
            <input
              aria-label={`Commenta il messaggio di ${post.author.displayName}`}
              className="grow-input"
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Rispondi a ${user.displayName === post.author.displayName ? "te stesso" : post.author.displayName}…`}
              value={draft}
            />
            <button disabled={busy || draft.trim().length === 0} type="submit">
              Invia
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
