import type { MissingSource, PostView } from "@estia/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../api.js";
import { FeedProgress, type SourceLoadingState } from "../components/FeedProgress.js";
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
  const [sourcesStates, setSourcesStates] = useState<SourceLoadingState[]>([]);
  const [isSourcesComplete, setIsSourcesComplete] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [caricato, setCaricato] = useState(false);
  const fondo = useRef<HTMLDivElement>(null);

  const caricaLocale = useCallback(
    async (signal?: AbortSignal) => {
      setError(undefined);
      setMancanti([]);
      setSourcesStates([]);
      setIsSourcesComplete(true);
      setPosts([]);

      try {
        const pagina = await api.timeline(token, { feed: "locale" }, signal);
        if (signal?.aborted) return;
        setPosts(pagina.posts);
        setCursor(pagina.nextCursor);
      } catch {
        if (signal?.aborted) return;
        setError("Non riesco a leggere la bacheca.");
      } finally {
        if (!signal?.aborted) {
          setCaricato(true);
        }
      }
    },
    [token],
  );

  const caricaReteProgressivo = useCallback(
    async (signal?: AbortSignal) => {
      setError(undefined);
      setMancanti([]);
      setPosts([]);
      setIsSourcesComplete(false);

      const statoInizialeLocale: SourceLoadingState = {
        isLocal: true,
        key: "local",
        name: "Questa istanza",
        status: "loading",
      };

      setSourcesStates([statoInizialeLocale]);

      // 1. Caricamento immediato dei post di rete di questa istanza (scope <> 'local')
      const caricaLocaliPromise = api
        .timeline(token, { feed: "seguiti", source: "local" }, signal)
        .then((pagina) => {
          if (signal?.aborted) return pagina;
          setPosts(pagina.posts);
          if (pagina.nextCursor) {
            setCursor(pagina.nextCursor);
          }
          setSourcesStates((prev) => {
            const haLocale = prev.some((s) => s.isLocal);
            if (haLocale) {
              return prev.map((s) =>
                s.isLocal ? { ...s, newPostsCount: pagina.posts.length, status: "done" } : s,
              );
            }
            return [
              {
                isLocal: true,
                key: "local",
                name: "Questa istanza",
                newPostsCount: pagina.posts.length,
                status: "done",
              },
              ...prev,
            ];
          });
          setCaricato(true);
          return pagina;
        })
        .catch(() => {
          if (signal?.aborted) return undefined;
          setSourcesStates((prev) =>
            prev.map((s) => (s.isLocal ? { ...s, newPostsCount: 0, status: "error" } : s)),
          );
          setCaricato(true);
          return undefined;
        });

      // 2. Lettura delle sorgenti federate
      try {
        const sources = await api.feedSources(token, { feed: "seguiti" }, signal);
        if (signal?.aborted) return;

        if (sources.remotes.length === 0) {
          await caricaLocaliPromise;
          if (!signal?.aborted) {
            setIsSourcesComplete(true);
            setCaricato(true);
          }
          return;
        }

        // Inizializza gli stati per ogni casa remota
        const remoteStates: SourceLoadingState[] = sources.remotes.map((r) => ({
          isLocal: false,
          key: r.instanceKey,
          name: r.istanza || `L'istanza ${r.instanceKey.slice(0, 10)}…`,
          status: "loading",
        }));

        setSourcesStates((prev) => {
          const loc = prev.find((s) => s.isLocal) ?? {
            isLocal: true,
            key: "local",
            name: "Questa istanza",
            status: "loading",
          };
          return [loc, ...remoteStates];
        });

        // 3. Caricamento parallelo di ciascuna casa remota
        const remotePromises = sources.remotes.map(async (remote) => {
          try {
            const pagina = await api.timeline(
              token,
              { feed: "seguiti", instanceKey: remote.instanceKey },
              signal,
            );
            if (signal?.aborted) return;

            if (pagina.mancanti && pagina.mancanti.length > 0) {
              setMancanti((prev) => {
                const keys = new Set(prev.map((m) => m.instanceKey));
                const newItems = (pagina.mancanti ?? []).filter((m) => !keys.has(m.instanceKey));
                return [...prev, ...newItems];
              });
              setSourcesStates((prev) =>
                prev.map((s) =>
                  s.key === remote.instanceKey ? { ...s, newPostsCount: 0, status: "error" } : s,
                ),
              );
            } else {
              if (pagina.posts.length > 0) {
                setPosts((correnti) => {
                  const map = new Map<string, PostView>();
                  for (const p of correnti) map.set(p.id, p);
                  for (const p of pagina.posts) map.set(p.id, p);
                  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                });
              }
              setSourcesStates((prev) =>
                prev.map((s) =>
                  s.key === remote.instanceKey
                    ? { ...s, newPostsCount: pagina.posts.length, status: "done" }
                    : s,
                ),
              );
            }
          } catch {
            if (signal?.aborted) return;
            setMancanti((prev) => {
              if (prev.some((m) => m.instanceKey === remote.instanceKey)) return prev;
              return [...prev, { instanceKey: remote.instanceKey, istanza: remote.istanza }];
            });
            setSourcesStates((prev) =>
              prev.map((s) =>
                s.key === remote.instanceKey ? { ...s, newPostsCount: 0, status: "error" } : s,
              ),
            );
          }
        });

        await Promise.allSettled([caricaLocaliPromise, ...remotePromises]);
        if (!signal?.aborted) {
          setIsSourcesComplete(true);
          setCaricato(true);
        }
      } catch {
        if (signal?.aborted) return;
        await caricaLocaliPromise;
        setIsSourcesComplete(true);
        setCaricato(true);
      }
    },
    [token],
  );

  const carica = useCallback(
    (signal?: AbortSignal) => {
      setCaricato(false);
      if (modo === "istanza") {
        return caricaLocale(signal);
      }
      return caricaReteProgressivo(signal);
    },
    [caricaLocale, caricaReteProgressivo, modo],
  );

  useEffect(() => {
    setPosts([]);
    setCaricato(false);
    const controller = new AbortController();
    void carica(controller.signal);

    return () => {
      controller.abort();
    };
  }, [carica, modo]);

  const ancora = useCallback(async () => {
    if (cursor === undefined) {
      return;
    }

    const pagina = await api.timeline(token, { cursor, feed });

    setPosts((correnti) => {
      const map = new Map<string, PostView>();
      for (const p of correnti) map.set(p.id, p);
      for (const p of pagina.posts) map.set(p.id, p);
      return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    setCursor(pagina.nextCursor);
    if (pagina.mancanti && pagina.mancanti.length > 0) {
      setMancanti((prev) => {
        const keys = new Set(prev.map((m) => m.instanceKey));
        const newItems = (pagina.mancanti ?? []).filter((m) => !keys.has(m.instanceKey));
        return [...prev, ...newItems];
      });
    }
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

      {modo === "rete" && sourcesStates.length > 0 && (
        <FeedProgress isComplete={isSourcesComplete} sources={sourcesStates} />
      )}

      {mancanti.length > 0 && isSourcesComplete && (
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

      {posts.length === 0 && (!isSourcesComplete || !caricato) && (
        <div className="feed">
          <SkeletonPost />
          <SkeletonPost lines={2} />
        </div>
      )}

      {posts.length === 0 && isSourcesComplete && caricato && (
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
                Qui compaiono i post di chi segui <strong>su questa istanza</strong> e sulle altre
                case. Qualcuno da seguire si trova dalla ricerca.
              </p>
            </EmptyState>
          )}
        </div>
      )}

      {posts.length > 0 && (
        <div className="feed">
          {posts.map((post) => (
            <PostCard key={post.id} onChanged={() => carica()} post={post} />
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
