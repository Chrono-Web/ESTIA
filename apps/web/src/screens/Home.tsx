import type { FollowsView, PostView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api.js";
import { ModeSwitch } from "../app/ModeSwitch.js";
import { ScreenHead } from "../app/ScreenHead.js";
import { Composer } from "../components/Composer.js";
import { PostCard } from "../components/PostCard.js";
import { nomeIstanza, useSignedIn } from "../state.js";
import { Alert, Button, EmptyState, SkeletonPost } from "../ui/index.js";

/**
 * La bacheca, nella lente in cui si sta.
 *
 * Due feed che non si sovrappongono: l'istanza, che non esce di casa, e la
 * rete, che raggiunge chi segue. Il composer scrive in quello in cui sei — è
 * ADR 0018 §«un pulsante per feed» — e non c'è nessun menu a tendina da
 * leggere prima di premere.
 */
export function Home(): React.ReactElement {
  const { instance, modo, token } = useSignedIn();
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
    setPosts([]);
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

  /*
   * La pagina successiva arriva quando il fondo entra in vista. Il pulsante
   * resta comunque, ed è quello che conta per chi naviga con la tastiera:
   * l'osservatore è una comodità, non l'unico modo di andare avanti.
   */
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

  const followerRemoti =
    follows?.followers.filter((row) => row.state === "accettato" && row.instanceKey !== "locale")
      .length ?? 0;

  return (
    <>
      <ScreenHead title={modo === "istanza" ? nomeIstanza(instance) : "La tua rete"}>
        <ModeSwitch />
      </ScreenHead>

      <main className="column stack">
        <div className="card card--flush">
          <Composer feed={feed} followerRemoti={followerRemoti} onPublished={carica} />
        </div>

        {error !== undefined && <Alert tone="error">{error}</Alert>}

        {!caricato && (
          <div className="card card--flush">
            <SkeletonPost />
            <SkeletonPost lines={2} />
          </div>
        )}

        {caricato && posts.length === 0 && (
          <div className="card">
            {modo === "istanza" ? (
              <EmptyState icon="home" title="Qui non c'è ancora niente">
                <p>
                  Nessuno ha ancora scritto niente. Il primo messaggio di un&apos;istanza è sempre
                  il più difficile.
                </p>
              </EmptyState>
            ) : (
              <EmptyState icon="globe" title="La tua rete è silenziosa">
                <p>
                  Qui compaiono i post di chi segui — e i tuoi, quando scrivi da questa lente.
                  Qualcuno da seguire si trova dalla <strong>ricerca</strong>.
                </p>
              </EmptyState>
            )}
          </div>
        )}

        {posts.length > 0 && (
          <div className="card card--flush feed">
            {posts.map((post) => (
              <PostCard key={post.id} onChanged={carica} post={post} />
            ))}
          </div>
        )}

        <div ref={fondo} />

        {cursor !== undefined && (
          <div className="center">
            <Button onClick={() => void ancora()} variant="secondary">
              Mostra altri messaggi
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
