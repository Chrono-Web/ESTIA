import type { PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { Composer } from "../components/Composer.js";
import { Post } from "../components/Post.js";
import { useSignedIn } from "../state.js";

export function Home(): React.ReactElement {
  const { token } = useSignedIn();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await api.timeline(token);
      setPosts(page.posts);
      setCursor(page.nextCursor);
    } catch {
      setError("Non riesco a leggere la bacheca.");
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async (): Promise<void> => {
    if (cursor === undefined) {
      return;
    }

    const page = await api.timeline(token, cursor);
    setPosts((current) => [...current, ...page.posts]);
    setCursor(page.nextCursor);
  };

  return (
    <main>
      <Composer onPublished={load} />

      {error !== undefined && <div className="alert error">{error}</div>}

      {loaded && posts.length === 0 && (
        <div className="card">
          <h2>La bacheca è vuota</h2>
          <p className="muted">
            Nessuno ha ancora scritto niente. Il primo messaggio di un'istanza è sempre il più
            difficile.
          </p>
        </div>
      )}

      {posts.map((post) => (
        <Post key={post.id} onChanged={load} post={post} />
      ))}

      {cursor !== undefined && (
        <div className="center">
          <button className="secondary" onClick={() => void loadMore()} type="button">
            Mostra altri messaggi
          </button>
        </div>
      )}
    </main>
  );
}
