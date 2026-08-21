import { COMMENT_MAX_LENGTH, type CommentView } from "@estia/contracts";
import { useMemo, useState } from "react";

import { api } from "../api.js";
import { useSignedIn } from "../state.js";
import { Button } from "../ui/index.js";
import { CommentItem } from "./CommentItem.js";

export interface CommentThreadProps {
  postId: string;
  postAuthorName: string;
  comments: CommentView[];
  onChanged: () => void | Promise<void>;
}

/**
 * Albero dei commenti, forma Threads.
 *
 * Ogni commento è un’unità completa (testo, like, rispondi, azioni), legata
 * al commento a cui risponde tramite `parentId`. L’albero è ricorsivo: una
 * risposta a una risposta resta sotto quel nodo, non viene schiacciata in
 * cima.
 */
export function CommentThread({
  postId,
  postAuthorName,
  comments,
  onChanged,
}: CommentThreadProps): React.ReactElement {
  const { token, user } = useSignedIn();
  const [draft, setDraft] = useState("");
  const [rispostaA, setRispostaA] = useState<CommentView | undefined>();
  const [busy, setBusy] = useState(false);

  const { roots, children } = useMemo(() => {
    const roots: CommentView[] = [];
    const children = new Map<string, CommentView[]>();

    for (const comment of comments) {
      const parentId = comment.parentId ?? null;

      if (parentId === null) {
        roots.push(comment);
        continue;
      }

      const list = children.get(parentId) ?? [];

      list.push(comment);
      children.set(parentId, list);
    }

    return { children, roots };
  }, [comments]);

  const commenta = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);

    try {
      await api.addComment(token, postId, {
        body: draft,
        ...(rispostaA !== undefined ? { parentId: rispostaA.id } : {}),
      });
      setDraft("");
      setRispostaA(undefined);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    rispostaA !== undefined
      ? `Rispondi a ${rispostaA.author.displayName}…`
      : `Rispondi a ${
          user.displayName === postAuthorName ? "te stesso" : postAuthorName
        }…`;

  return (
    <div className="post__comments">
      {comments.length === 0 && <p className="muted">Ancora nessun commento.</p>}

      {roots.map((comment) => (
        <CommentBranch
          childrenByParent={children}
          comment={comment}
          depth={0}
          key={comment.id}
          onChanged={onChanged}
          onReply={setRispostaA}
        />
      ))}

      <form className="comment-composer" onSubmit={(event) => void commenta(event)}>
        {rispostaA !== undefined && (
          <p className="comment-composer__ctx">
            Risposta a <strong>{rispostaA.author.displayName}</strong>
            <Button onClick={() => setRispostaA(undefined)} variant="quiet">
              Annulla
            </Button>
          </p>
        )}
        <div className="cluster">
          <input
            aria-label={placeholder}
            className="input grow"
            id="commento-nuovo"
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            value={draft}
          />
          <Button disabled={busy || draft.trim().length === 0} type="submit">
            Invia
          </Button>
        </div>
      </form>
    </div>
  );
}

function CommentBranch({
  comment,
  childrenByParent,
  depth,
  onChanged,
  onReply,
}: {
  comment: CommentView;
  childrenByParent: Map<string, CommentView[]>;
  depth: number;
  onChanged: () => void | Promise<void>;
  onReply: (comment: CommentView) => void;
}): React.ReactElement {
  const figli = childrenByParent.get(comment.id) ?? [];
  // Oltre un certo livello il filo resta, ma non si allarga all’infinito sullo
  // schermo stretto — come Threads limita l’indentazione visiva.
  const rientro = Math.min(depth, 4);

  return (
    <div
      className={depth === 0 ? "comment-branch" : "comment-branch comment-branch--nested"}
      data-depth={String(rientro)}
    >
      <CommentItem comment={comment} nested={depth > 0} onChanged={onChanged} onReply={onReply} />
      {figli.map((figlio) => (
        <CommentBranch
          childrenByParent={childrenByParent}
          comment={figlio}
          depth={depth + 1}
          key={figlio.id}
          onChanged={onChanged}
          onReply={onReply}
        />
      ))}
    </div>
  );
}
