import type { PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api.js";
import { PostCard } from "../components/PostCard.js";
import { useSignedIn } from "../state.js";
import { Alert, EmptyState, SkeletonPost } from "../ui/index.js";

/**
 * La pagina di un singolo post: messaggio in evidenza (avatar grande),
 * separatore, poi i commenti. Con `/c/:commentId` la catena fino a quel
 * commento sta sopra il separatore, come «Rispondi» su Threads.
 */
export function PostDetail(): React.ReactElement {
  const { id, instanceKey, username, commentId } = useParams<{
    id: string;
    instanceKey?: string;
    username?: string;
    commentId?: string;
  }>();
  const { token } = useSignedIn();
  const [post, setPost] = useState<PostView | undefined>();
  const [errore, setErrore] = useState<string | undefined>();

  const carica = useCallback(async () => {
    if (id === undefined) {
      return;
    }

    setErrore(undefined);

    try {
      if (instanceKey !== undefined && username !== undefined) {
        setPost(await api.getRemotePost(token, { instanceKey, username }, id));
      } else {
        setPost(await api.getPost(token, id));
      }
    } catch {
      setPost(undefined);
      setErrore("Questo messaggio non c’è più, o non puoi vederlo.");
    }
  }, [id, token, instanceKey, username]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (errore !== undefined) {
    return (
      <div className="column">
        <Alert tone="error">{errore}</Alert>
        <EmptyState title="Messaggio non trovato">
          <Link className="btn btn--secondary" to="/">
            Torna al feed
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (post === undefined) {
    return (
      <div className="column">
        <SkeletonPost />
      </div>
    );
  }

  return (
    <div className="column column--feed post-page">
      <PostCard
        {...(commentId !== undefined ? { focusCommentId: commentId } : {})}
        onChanged={carica}
        post={post}
        variant="detail"
      />
    </div>
  );
}
