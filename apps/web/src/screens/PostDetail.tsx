import type { PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api.js";
import { PostCard } from "../components/PostCard.js";
import { useSignedIn } from "../state.js";
import { Alert, EmptyState, SkeletonPost } from "../ui/index.js";

/**
 * La pagina di un singolo post: sopra il messaggio, sotto i commenti.
 *
 * Il chrome (indietro / lente bloccata / menu) lo decide `TopBar` dalla rotta.
 */
export function PostDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const { token } = useSignedIn();
  const [post, setPost] = useState<PostView | undefined>();
  const [errore, setErrore] = useState<string | undefined>();

  const carica = useCallback(async () => {
    if (id === undefined) {
      return;
    }

    setErrore(undefined);

    try {
      setPost(await api.getPost(token, id));
    } catch {
      setPost(undefined);
      setErrore("Questo messaggio non c’è più, o non puoi vederlo.");
    }
  }, [id, token]);

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
    <div className="column">
      <PostCard onChanged={carica} post={post} variant="detail" />
    </div>
  );
}
