import type { FollowsView } from "@estia/contracts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api.js";
import { Composer } from "../components/Composer.js";
import { nomeIstanza, useSignedIn } from "../state.js";

/**
 * Scrivere un post, da una pagina sua.
 *
 * Sul telefono il composer non vive più infilato in cima al feed: il pulsante
 * «crea» della barra porta qui, come su Threads. La lente decide ancora chi
 * leggerà — è la stessa regola di ADR 0018.
 */
export function Scrivi(): React.ReactElement {
  const { instance, modo, token } = useSignedIn();
  const navigate = useNavigate();
  const feed = modo === "istanza" ? "locale" : "seguiti";
  const [follows, setFollows] = useState<FollowsView | undefined>();

  useEffect(() => {
    void api
      .follows(token)
      .then(setFollows)
      .catch(() => undefined);
  }, [token]);

  const followerRemoti =
    follows?.followers.filter((row) => row.state === "accettato" && row.instanceKey !== "locale")
      .length ?? 0;

  return (
    <main className="column column--feed">
      <div className="feed-pad stack--tight scrivi-testata">
        <h1 className="scrivi-titolo">Nuovo messaggio</h1>
        <p className="muted">
          {modo === "istanza"
            ? `Lo vedono i membri di ${nomeIstanza(instance)}.`
            : "Lo vedono le persone che ti seguono."}
        </p>
      </div>
      <div className="composer-shell">
        <Composer
          feed={feed}
          followerRemoti={followerRemoti}
          onPublished={() => {
            void navigate("/");
          }}
        />
      </div>
    </main>
  );
}
