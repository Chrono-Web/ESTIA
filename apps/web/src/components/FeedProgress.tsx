import { T, t } from "../i18n/index.js";
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
  /**
   * Se c'è già qualcosa da leggere sotto.
   *
   * Decide **quanto** di questo pannello si vede, e nient'altro: con lo schermo
   * ancora vuoto l'elenco casa per casa è l'unica cosa che sta succedendo, e va
   * mostrato; con il feed già sotto agli occhi diventa la sala macchine davanti
   * al contenuto, e resta la riga di riepilogo.
   */
  conContenuti?: boolean;
}

/**
 * Mini-pannello di stato del feed federato.
 *
 * Dice sempre da dove arrivano i contenuti e come è andata — euristica 1 di
 * `DESIGN_SYSTEM.md`, e nessuna casa che tace resta taciuta — ma non sempre con
 * lo stesso dettaglio (euristica 8: una sezione, un lavoro).
 *
 * L'elenco casa per casa compare quando **porta informazione a chi legge**: al
 * primo caricamento, quando non c'è ancora niente sotto, e ogni volta che una
 * casa non ha risposto, perché quella riga dice il nome e la causa (euristica 9).
 * Quando è tutto aggiornato e il feed è già lì, resta la sola riga di riepilogo:
 * prima l'elenco compariva comunque, e la diagnosi finiva davanti al contenuto.
 */
export function FeedProgress({
  sources,
  isComplete,
  conContenuti = false,
}: FeedProgressProps): React.ReactElement {
  const locali = sources.find((s) => s.isLocal) ?? {
    isLocal: true,
    key: "local",
    name: t("feed.source.this_instance"),
    newPostsCount: 0,
    status: isComplete ? "done" : "loading",
  };

  const remote = sources.filter((s) => !s.isLocal);
  const totali = 1 + remote.length;
  const completate =
    (locali.status === "done" ? 1 : 0) + remote.filter((s) => s.status === "done").length;
  const mancanti = remote.filter((s) => s.status === "error");

  const messaggioLive = !isComplete
    ? t("feed.progress.live.loading", { done: String(completate), total: String(totali) })
    : mancanti.length === 0
      ? t("feed.progress.live.done")
      : t("feed.progress.live.missing", { count: mancanti.length });

  // L'elenco disteso solo quando dice qualcosa che la riga sopra non dice già.
  const mostraElenco = mancanti.length > 0 || (!isComplete && !conContenuti);

  return (
    <section aria-label={t("feed.progress.label")} className="feed-progress">
      <Live>{messaggioLive}</Live>

      <div className="feed-progress__header">
        <div className="feed-progress__title-group">
          <span
            className={`feed-progress__dot ${!isComplete ? "feed-progress__dot--pulsing" : mancanti.length > 0 ? "feed-progress__dot--warning" : "feed-progress__dot--done"}`}
          />
          <span className="feed-progress__summary">
            {!isComplete ? (
              <T
                k="feed.progress.summary.loading"
                params={{ done: String(completate), total: String(totali) }}
                tags={{ muted: (testo) => <span className="muted">{testo}</span> }}
              />
            ) : mancanti.length === 0 ? (
              t("feed.progress.summary.done")
            ) : (
              <T
                k="feed.progress.summary.missing"
                params={{ count: mancanti.length }}
                tags={{
                  warn: (testo) => <span className="feed-progress__warn-text">{testo}</span>,
                }}
              />
            )}
          </span>
        </div>
      </div>

      {mostraElenco && (
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
                ? t("feed.progress.local.loading")
                : locali.newPostsCount !== undefined && locali.newPostsCount > 0
                  ? t("feed.progress.local.posts", { count: locali.newPostsCount })
                  : t("feed.progress.local.none")}
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
                  t("feed.progress.remote.loading")
                ) : casa.status === "error" ? (
                  <span className="feed-progress__warn-text">
                    {t("feed.progress.remote.error")}
                  </span>
                ) : casa.newPostsCount !== undefined && casa.newPostsCount > 0 ? (
                  t("feed.progress.remote.posts", { count: casa.newPostsCount })
                ) : (
                  t("feed.progress.remote.none")
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
