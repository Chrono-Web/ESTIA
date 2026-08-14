import { POST_MAX_LENGTH, type PostView } from "@estia/contracts";
import { useCallback, useEffect, useState } from "react";

import { api } from "../api.js";
import { Post } from "../components/Post.js";
import { useSignedIn } from "../state.js";

export function Home(): React.ReactElement {
  const { instance, token, user } = useSignedIn();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
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

  const publish = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      await api.createPost(token, { body: draft });
      setDraft("");
      await load();
    } catch {
      setError("Non sono riuscito a pubblicare.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <div className="card">
        <form onSubmit={(event) => void publish(event)}>
          <label>
            <span className="label-text">Scrivi al quartiere</span>
            <textarea
              maxLength={POST_MAX_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={`Cosa succede in ${instance.name}, ${user.displayName}?`}
              value={draft}
            />
          </label>

          {error !== undefined && <div className="alert error">{error}</div>}

          <div className="actions">
            <button disabled={busy || draft.trim().length === 0} type="submit">
              {busy ? "Pubblico…" : "Pubblica"}
            </button>
            {/* Said plainly, once, where it matters (PRODUCT_VISION §3). */}
            <span className="muted">Lo vedono solo i membri di {instance.name}.</span>
          </div>
        </form>
      </div>

      {loaded && posts.length === 0 && (
        <div className="card">
          <h2>La bacheca è vuota</h2>
          <p className="muted">
            Nessuno ha ancora scritto niente. Il primo messaggio di un quartiere è sempre il più
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
