import type { FollowsView, PostView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import { PostCard } from "../components/PostCard.js";
import { useSignedIn } from "../state.js";
import { Alert, Button, EmptyState, SkeletonPost } from "../ui/index.js";

/**
 * La bacheca, nella lente in cui si sta.
 *
 * Scrivere sta nel popup «Nuovo messaggio» (`/scrivi`), non qui.
 */
export function Home(): React.ReactElement {
  const { modo, token } = useSignedIn();
  const feed = modo === "istanza" ? "locale" : "seguiti";

  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [follows, setFollows] = useState<FollowsView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [caricato, setCaricato] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);

  const carica = useCallback(async () => {
    setError(undefined);

    try {
      const pagina = await api.timeline(token, { feed });

      setPosts(pagina.posts);
      setCursor(pagina.nextCursor);
    } catch {
      setError("Non riesco a leggere la bacheca.");
    } finally {
      setCaricato(true);
    }
  }, [feed, token]);

  useEffect(() => {
    setCaricato(false);
    void carica();
  }, [carica]);

  useEffect(() => {
    void api
      .follows(token)
      .then(setFollows)
      .catch(() => undefined);
  }, [token]);

  const ancora = useCallback(async () => {
    if (cursor === undefined) {
      return;
    }

    const pagina = await api.timeline(token, { cursor, feed });

    setPosts((correnti) => [...correnti, ...pagina.posts]);
    setCursor(pagina.nextCursor);
  }, [cursor, feed, token]);

  useEffect(() => {
    const sentinella = fondo.current;

    if (sentinella === null || cursor === undefined) {
      return;
    }

    const osservatore = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void ancora();
      }
    });

    osservatore.observe(sentinella);

    return () => osservatore.disconnect();
  }, [ancora, cursor]);

  const seguitiRemoti =
    follows?.following.filter((row) => row.state === "accettato" && row.instanceKey !== "locale")
      .length ?? 0;

  return (
    <main className="column column--feed">
      {error !== undefined && (
        <div className="feed-pad">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {modo === "rete" && seguitiRemoti > 0 && (
        <div className="feed-pad">
          <Alert>
            {seguitiRemoti === 1
              ? "Una persona che segui sta su un'altra istanza, e qui non la leggi"
              : `${String(seguitiRemoti)} persone che segui stanno su altre istanze, e qui non le leggi`}
            : i post restano sulla macchina di chi li scrive, e il modo di andarli a prendere è
            ancora da costruire. Qui compare chi segui su questa istanza.
          </Alert>
        </div>
      )}

      {!caricato && posts.length === 0 && (
        <div className="feed">
          <SkeletonPost />
          <SkeletonPost lines={2} />
        </div>
      )}

      {caricato && posts.length === 0 && (
        <div className="feed-pad">
          {modo === "istanza" ? (
            <EmptyState icon="home" title="Qui non c'è ancora niente">
              <p>
                Nessuno ha ancora scritto niente. Il primo messaggio si scrive dal pulsante{" "}
                <strong>crea</strong>.
              </p>
            </EmptyState>
          ) : (
            <EmptyState icon="globe" title="La tua rete è silenziosa">
              <p>
                Qui compaiono i post di chi segui <strong>su questa istanza</strong>. Qualcuno da
                seguire si trova dalla ricerca.
              </p>
            </EmptyState>
          )}
        </div>
      )}

      {posts.length > 0 && (
        <div className={caricato ? "feed" : "feed feed--attesa"}>
          {posts.map((post) => (
            <PostCard key={post.id} onChanged={carica} post={post} />
          ))}
        </div>
      )}

      <div ref={fondo} />

      {cursor !== undefined && (
        <div className="center feed-pad">
          <Button onClick={() => void ancora()} variant="secondary">
            Mostra altri messaggi
          </Button>
        </div>
      )}
    </main>
  );
}
