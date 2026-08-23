import { Icon, Live } from "../ui/index.js";

export interface SourceLoadingState {
  key: string;
  name: string;
  isLocal: boolean;
  status: "loading" | "done" | "error";
  newPostsCount?: number;
}

export interface FeedProgressProps {
  sources: SourceLoadingState[];
  isComplete: boolean;
}

/**
 * Mini-pannello di stato del feed federato.
 *
 * Mostra permanentemente la provenienza dei contenuti dalle varie case collegate:
 * - Questa istanza (caricata subito)
 * - Le case federate (in contatto, pronte o non raggiungibili)
 */
export function FeedProgress({ sources, isComplete }: FeedProgressProps): React.ReactElement {
  const locali = sources.find((s) => s.isLocal) ?? {
    isLocal: true,
    key: "local",
    name: "Questa istanza",
    newPostsCount: 0,
    status: isComplete ? "done" : "loading",
  };

  const remote = sources.filter((s) => !s.isLocal);
  const totali = 1 + remote.length;
  const completate =
    (locali.status === "done" ? 1 : 0) + remote.filter((s) => s.status === "done").length;
  const mancanti = remote.filter((s) => s.status === "error");

  const messaggioLive = !isComplete
    ? `Contatto in corso con le case della rete: ${String(completate)} di ${String(totali)} pronte.`
    : mancanti.length === 0
      ? "Tutte le case della rete hanno risposto."
      : `${String(mancanti.length)} ${mancanti.length === 1 ? "casa non ha" : "case non hanno"} risposto.`;

  return (
    <section aria-label="Stato connessione della rete" className="feed-progress">
      <Live>{messaggioLive}</Live>

      <div className="feed-progress__header">
        <div className="feed-progress__title-group">
          <span
            className={`feed-progress__dot ${!isComplete ? "feed-progress__dot--pulsing" : mancanti.length > 0 ? "feed-progress__dot--warning" : "feed-progress__dot--done"}`}
          />
          <span className="feed-progress__summary">
            {!isComplete ? (
              <>
                Collegamento alle case in corso…{" "}
                <span className="muted">
                  ({completate}/{totali} pronte)
                </span>
              </>
            ) : mancanti.length === 0 ? (
              <>Tutte le case collegate sono aggiornate</>
            ) : (
              <>
                Rete aggiornata ·{" "}
                <span className="feed-progress__warn-text">
                  {mancanti.length === 1
                    ? "1 casa non raggiungibile"
                    : `${mancanti.length} case non raggiungibili`}
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      <ul className="feed-progress__list">
        <li className="feed-progress__item" key="local">
          <span
            className={`feed-progress__item-icon ${locali.status === "loading" ? "feed-progress__item-icon--loading" : "feed-progress__item-icon--ok"}`}
          >
            <Icon name={locali.status === "loading" ? "instance" : "check"} size={14} />
          </span>
          <span className="feed-progress__item-name">
            <strong>{locali.name}</strong>
          </span>
          <span className="feed-progress__item-status muted">
            {locali.status === "loading"
              ? "lettura in corso…"
              : locali.newPostsCount !== undefined && locali.newPostsCount > 0
                ? `${locali.newPostsCount} ${locali.newPostsCount === 1 ? "post di rete" : "post di rete"}`
                : "pronta (0 post di rete)"}
          </span>
        </li>

        {remote.map((casa) => (
          <li className="feed-progress__item" key={casa.key}>
            <span
              className={`feed-progress__item-icon ${
                casa.status === "loading"
                  ? "feed-progress__item-icon--loading"
                  : casa.status === "error"
                    ? "feed-progress__item-icon--error"
                    : "feed-progress__item-icon--ok"
              }`}
            >
              <Icon
                name={
                  casa.status === "loading"
                    ? "instance"
                    : casa.status === "error"
                      ? "alert"
                      : "check"
                }
                size={14}
              />
            </span>
            <span className="feed-progress__item-name">{casa.name}</span>
            <span className="feed-progress__item-status muted">
              {casa.status === "loading" ? (
                "sto contattando…"
              ) : casa.status === "error" ? (
                <span className="feed-progress__warn-text">
                  non ha risposto (spenta o non raggiungibile)
                </span>
              ) : casa.newPostsCount !== undefined && casa.newPostsCount > 0 ? (
                `${casa.newPostsCount} ${casa.newPostsCount === 1 ? "nuovo post" : "nuovi post"}`
              ) : (
                "aggiornata (0 post)"
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
