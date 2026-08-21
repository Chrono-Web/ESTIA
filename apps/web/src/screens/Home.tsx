import type { MissingSource, PostView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../api.js";
import { PostCard } from "../components/PostCard.js";
import { useSignedIn } from "../state.js";
import { Alert, Button, EmptyState, SkeletonPost } from "../ui/index.js";

/**
 * La bacheca, nella lente in cui si sta.
 *
 * Scrivere sta nel popup «Nuovo messaggio» (`/scrivi`), non qui.
 */
/**
 * Come si chiama una casa che non ha risposto.
 *
 * Il nome è quello che quell'istanza dà a sé stessa, e l'unica cosa verificata
 * di lei è la chiave (ADR 0020 §5): quando il nome manca si mostra la chiave
 * accorciata, che è meno leggibile e più vera di un nome inventato qui.
 */
function nomeDiCasa(casa: MissingSource | undefined): string {
  if (casa === undefined) {
    return "Un'istanza";
  }

  return casa.istanza === "" ? `L'istanza ${casa.instanceKey.slice(0, 12)}…` : casa.istanza;
}

export function Home(): React.ReactElement {
  const { modo, token } = useSignedIn();
  const feed = modo === "istanza" ? "locale" : "seguiti";
  const location = useLocation();
  const navigate = useNavigate();
  const focusPostId =
    typeof location.state === "object" &&
    location.state !== null &&
    "focusPostId" in location.state &&
    typeof (location.state as { focusPostId?: unknown }).focusPostId === "string"
      ? (location.state as { focusPostId: string }).focusPostId
      : undefined;

  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [mancanti, setMancanti] = useState<MissingSource[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [caricato, setCaricato] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);

  const carica = useCallback(async () => {
    setError(undefined);

    try {
      const pagina = await api.timeline(token, { feed });

      setPosts(pagina.posts);
      setCursor(pagina.nextCursor);
      setMancanti(pagina.mancanti ?? []);
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

  const ancora = useCallback(async () => {
    if (cursor === undefined) {
      return;
    }

    const pagina = await api.timeline(token, { cursor, feed });

    setPosts((correnti) => [...correnti, ...pagina.posts]);
    setCursor(pagina.nextCursor);
    setMancanti(pagina.mancanti ?? []);
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

  // Torna dal thread: centra il feed sul post da cui si era partiti.
  useEffect(() => {
    if (focusPostId === undefined || !caricato) {
      return;
    }

    const nodo = document.getElementById(`post-${focusPostId}`);

    if (nodo !== null) {
      nodo.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    void navigate(".", { replace: true, state: null });
  }, [caricato, focusPostId, navigate, posts]);

  /*
   * Le case che non hanno risposto ([ADR 0023] §5, vincolo 3).
   *
   * Dal 2026-08-21 i post attraversano, quindi la cosa da dichiarare non è più
   * che manca tutto: è che può mancare **una parte**, e di chi è. Un feed
   * incompleto in silenzio sarebbe indistinguibile da uno rotto, che è
   * esattamente l'errore che questa milestone è nata per correggere.
   */

  return (
    <main className="column column--feed">
      {error !== undefined && (
        <div className="feed-pad">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {mancanti.length > 0 && (
        <div className="feed-pad">
          <Alert>
            {mancanti.length === 1
              ? `${nomeDiCasa(mancanti[0])} non ha risposto`
              : `${String(mancanti.length)} case non hanno risposto`}
            : i loro post stanno sulle loro macchine, e finché sono spente — o irraggiungibili —
            questa pagina è incompleta. Non manca niente di tuo.
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
