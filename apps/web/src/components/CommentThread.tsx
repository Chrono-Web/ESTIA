import { COMMENT_MAX_LENGTH, type CommentView } from "@estia/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { Avatar, Button } from "../ui/index.js";
import { CommentItem } from "./CommentItem.js";

export interface CommentThreadProps {
  postId: string;
  postAuthorId: string;
  postAuthorName: string;
  postAuthorUsername: string;
  comments: CommentView[];
  onChanged: () => void | Promise<void>;
  /** Abre il focus su quel commento (pagina dettaglio). */
  onOpenComment?: (comment: CommentView) => void;
  /**
   * «Rispondi» apre la pagina di quel commento (come un post), non il
   * composer inline — come Threads.
   */
  onReplyComment?: (comment: CommentView) => void;
  /**
   * Se impostato, sotto il separatore compaiono solo le risposte a questo
   * commento. Altrimenti le radici del post.
   */
  replyToId?: string | null;
  remoto?: {
    instanceKey: string;
    istanza: string;
  };
}

/**
 * Mini-feed sotto il separatore: stessa logica del feed principale.
 * Una risposta → inline con linea; due o più → curva e «Mostra N risposte».
 */
export function CommentThread({
  postId,
  postAuthorId,
  postAuthorName,
  postAuthorUsername,
  comments,
  onChanged,
  onOpenComment,
  onReplyComment,
  replyToId = null,
  remoto,
}: CommentThreadProps): React.ReactElement {
  const { token, user } = useSignedIn();
  const [draft, setDraft] = useState("");
  const [rispostaA, setRispostaA] = useState<CommentView | undefined>();
  const [busy, setBusy] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const { byId, children } = useMemo(() => {
    const byId = new Map<string, CommentView>();
    const children = new Map<string, CommentView[]>();

    for (const comment of comments) {
      byId.set(comment.id, comment);
      const parentId = comment.parentId ?? null;

      if (parentId === null) {
        const list = children.get("") ?? [];

        list.push(comment);
        children.set("", list);
        continue;
      }

      const list = children.get(parentId) ?? [];

      list.push(comment);
      children.set(parentId, list);
    }

    return { byId, children };
  }, [comments]);

  const roots = children.get(replyToId ?? "") ?? [];

  useEffect(() => {
    if (rispostaA !== undefined) {
      campo.current?.focus();
    }
  }, [rispostaA]);

  useEffect(() => {
    if (replyToId === null) {
      return;
    }

    const focus = byId.get(replyToId);

    if (focus !== undefined) {
      setRispostaA(focus);
    }
  }, [byId, replyToId]);

  const commenta = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);

    try {
      const parent =
        rispostaA !== undefined ? rispostaA.id : replyToId !== null ? replyToId : undefined;

      if (remoto !== undefined) {
        await api.addRemoteComment(
          token,
          { instanceKey: remoto.instanceKey, username: postAuthorUsername },
          postId,
          {
            body: draft,
            ...(parent !== undefined ? { parentId: parent } : {}),
          },
        );
      } else {
        await api.addComment(token, postId, {
          body: draft,
          ...(parent !== undefined ? { parentId: parent } : {}),
        });
      }
      setDraft("");

      if (replyToId === null) {
        setRispostaA(undefined);
      }

      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const focusName = replyToId !== null ? byId.get(replyToId)?.author.displayName : undefined;

  const placeholder =
    rispostaA !== undefined
      ? `Rispondi a ${rispostaA.author.displayName}…`
      : focusName !== undefined
        ? `Rispondi a ${focusName}…`
        : `Rispondi a ${user.displayName === postAuthorName ? "te stesso" : postAuthorName}…`;

  const rispondi = (comment: CommentView): void => {
    if (onReplyComment !== undefined) {
      onReplyComment(comment);
      return;
    }

    setRispostaA(comment);
  };

  const apri = (comment: CommentView): void => {
    onOpenComment?.(comment);
  };

  return (
    <>
      <div className="post__comments">
        {roots.length === 0 && (
          <p className="muted feed-pad">
            {replyToId !== null ? "Ancora nessuna risposta." : "Ancora nessun commento."}
          </p>
        )}

        {roots.map((comment) => (
          <CommentBranch
            childrenByParent={children}
            comment={comment}
            key={comment.id}
            onChanged={onChanged}
            onOpen={apri}
            onReply={rispondi}
            postAuthorId={postAuthorId}
          />
        ))}
      </div>

      <form className="comment-dock" onSubmit={(event) => void commenta(event)}>
        <div className="comment-dock__interno">
          {rispostaA !== undefined && replyToId === null && (
            <p className="comment-composer__ctx">
              Risposta a <strong>{rispostaA.author.displayName}</strong>
              <Button onClick={() => setRispostaA(undefined)} variant="quiet">
                Annulla
              </Button>
            </p>
          )}
          {rispostaA !== undefined && replyToId !== null && rispostaA.id !== replyToId && (
            <p className="comment-composer__ctx">
              Risposta a <strong>{rispostaA.author.displayName}</strong>
              <Button
                onClick={() => {
                  const focus = byId.get(replyToId);

                  setRispostaA(focus);
                }}
                variant="quiet"
              >
                Annulla
              </Button>
            </p>
          )}
          <div className="comment-dock__riga">
            <Avatar displayName={user.displayName} size="sm" username={user.username} />
            <input
              aria-label={placeholder}
              className="input grow"
              id="commento-nuovo"
              maxLength={COMMENT_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={placeholder}
              ref={campo}
              value={draft}
            />
            <Button disabled={busy || draft.trim().length === 0} type="submit">
              Invia
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}

/**
 * Come un post nel feed: 0 risposte → solo il commento; 1 → linea + figlio;
 * 2+ → stelo, gomito e «Mostra N risposte» verso la pagina di quel commento.
 */
function CommentBranch({
  comment,
  childrenByParent,
  continueFromParent = false,
  onChanged,
  onOpen,
  onReply,
  postAuthorId,
}: {
  comment: CommentView;
  childrenByParent: Map<string, CommentView[]>;
  continueFromParent?: boolean;
  onChanged: () => void | Promise<void>;
  onOpen: (comment: CommentView) => void;
  onReply: (comment: CommentView) => void;
  postAuthorId: string;
}): React.ReactElement {
  const figli = childrenByParent.get(comment.id) ?? [];
  const n = figli.length;
  const rail = n === 0 ? undefined : n === 1 ? ("line" as const) : ("stem" as const);
  const primo = figli[0];

  return (
    <div className="thread-unit">
      <CommentItem
        comment={comment}
        continueFromParent={continueFromParent}
        onChanged={onChanged}
        onOpen={onOpen}
        onReply={onReply}
        postAuthorId={postAuthorId}
        {...(rail !== undefined ? { rail } : {})}
        size="sm"
      />

      {n === 1 && primo !== undefined && (
        <CommentBranch
          childrenByParent={childrenByParent}
          comment={primo}
          continueFromParent
          onChanged={onChanged}
          onOpen={onOpen}
          onReply={onReply}
          postAuthorId={postAuthorId}
        />
      )}

      {n >= 2 && primo !== undefined && (
        <div className="thread-more">
          <div aria-hidden="true" className="thread-more__rail">
            <span className="thread-curve__elbow" />
          </div>
          <button className="thread-more__hit" onClick={() => onOpen(comment)} type="button">
            <Avatar
              displayName={primo.author.displayName}
              size="sm"
              username={primo.author.username}
            />
            {`Mostra ${String(n)} risposte`}
          </button>
        </div>
      )}
    </div>
  );
}

/** Catena post → … → commento in evidenza, sopra il separatore. */
export function buildCommentChain(comments: CommentView[], focusId: string): CommentView[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const chain: CommentView[] = [];
  let current: CommentView | undefined = byId.get(focusId);

  while (current !== undefined) {
    chain.unshift(current);
    current = current.parentId !== null ? byId.get(current.parentId) : undefined;
  }

  return chain;
}
