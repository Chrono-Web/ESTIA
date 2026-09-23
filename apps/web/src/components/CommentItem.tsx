import { COMMENT_MAX_LENGTH, type CommentView } from "@estia/contracts";
import { useEffect, useState } from "react";

import { api } from "../api.js";
import { formatoNumero, t } from "../i18n/index.js";
import { useSignedIn } from "../state.js";
import { quandoBreve, quandoPerEsteso } from "../tempo.js";
import { Avatar, Button, Icon, MenuAzioni, type AvatarSize } from "../ui/index.js";
import { PersonLink } from "./PersonLink.js";

export interface CommentItemProps {
  comment: CommentView;
  /**
   * Continuazione della rail: `line` (una sola risposta sotto),
   * `stem` (curva verso «Mostra N risposte»), niente se foglia.
   */
  rail?: "line" | "stem";
  /** Unità sotto un padre: senza padding sopra, linea che continua. */
  continueFromParent?: boolean;
  onChanged: () => void | Promise<void>;
  onOpen?: (comment: CommentView) => void;
  onReply: (comment: CommentView) => void;
  /** Id dell'autore del post: se coincide, mostra etichetta «Autore». */
  postAuthorId?: string;
  /** Anteprima nel feed: tap sul testo apre il dettaglio via onReply. */
  preview?: boolean;
  size?: AvatarSize;
}

/**
 * Un commento con le azioni di Threads: like, rispondi, e i tre puntini per
 * modificare / nascondere / eliminare (quest’ultima con una conferma in più).
 */
export function CommentItem({
  comment,
  rail,
  continueFromParent = false,
  onChanged,
  onOpen,
  onReply,
  postAuthorId,
  preview = false,
  size = "sm",
}: CommentItemProps): React.ReactElement {
  const { token } = useSignedIn();
  /**
   * L'editor sta **nel commento**, non dentro il menu.
   *
   * Prima la `<textarea>` viveva dentro il pannello ancorato: si riscriveva un
   * testo senza poter vedere quello che si stava riscrivendo, né le risposte
   * che ci stanno sotto. Il menu adesso si chiude e la modifica prende il posto
   * del testo, dov'è.
   */
  const [modifica, setModifica] = useState(false);
  const [bozza, setBozza] = useState(comment.body);
  const [loadedBody, setLoadedBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const isRemote = Boolean(
    comment.remoteInstanceKey && comment.remoteCommentId && comment.body === "",
  );

  useEffect(() => {
    if (!isRemote) return;

    let active = true;
    setLoading(true);
    setError(false);

    api
      .getPublicComment(comment.remoteInstanceKey!, comment.remoteCommentId!)
      .then((res) => {
        if (active) {
          setLoadedBody(res.body);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isRemote, comment.remoteInstanceKey, comment.remoteCommentId]);

  const [busy, setBusy] = useState(false);
  const [likeLocale, setLikeLocale] = useState<{ liked: boolean; count: number } | undefined>();
  const liked = likeLocale?.liked ?? comment.liked ?? false;
  const likeCount = likeLocale?.count ?? comment.likeCount ?? 0;
  const haAzioni = Boolean(comment.canEdit || comment.canDelete || comment.canModerate);
  const eAutore = postAuthorId !== undefined && comment.author.id === postAuthorId;
  const isHero = size === "lg";
  const rowClass = [
    "thread-row",
    isHero ? "thread-row--hero" : undefined,
    !isHero && continueFromParent ? "thread-row--continue" : undefined,
    !isHero && !continueFromParent ? "thread-row--comment" : undefined,
    rail === "stem" ? "thread-row--to-more" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  const cambiaLike = async (): Promise<void> => {
    const prossimo = !liked;

    setLikeLocale({ count: likeCount + (prossimo ? 1 : -1), liked: prossimo });

    try {
      await api.setCommentLike(token, comment.id, prossimo);
      await onChanged();
      setLikeLocale(undefined);
    } catch {
      setLikeLocale(undefined);
    }
  };

  const salva = async (): Promise<void> => {
    setBusy(true);

    try {
      await api.updateComment(token, comment.id, bozza);
      setModifica(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const nascondi = async (): Promise<void> => {
    await api.setCommentHidden(token, comment.id, !comment.hidden);
    await onChanged();
  };

  const elimina = async (): Promise<void> => {
    await api.deleteComment(token, comment.id);
    await onChanged();
  };

  const apri = (): void => {
    if (preview) {
      onReply(comment);
      return;
    }

    onOpen?.(comment);
  };

  /*
   * Una lapide: il commento è stato eliminato, ma teneva su delle risposte.
   * Occupa il suo posto e nient'altro — nessun nome, nessuna azione, nessun
   * mi piace. Serve solo perché il ramo che regge resti raggiungibile: senza,
   * quelle risposte sparirebbero pur restando nel database e nel conteggio.
   */
  if (comment.deleted) {
    return (
      <div className={rowClass}>
        <div className="thread-rail">
          <span aria-hidden="true" className="thread-lapide" />
          {rail === "line" && <span aria-hidden="true" className="thread-line" />}
          {rail === "stem" && <span aria-hidden="true" className="thread-curve__stem" />}
        </div>
        <div className="thread-main">
          <p className="muted">{t("post.comment.deleted")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={rowClass}>
        <div className="thread-rail">
          <PersonLink className="avatar-link" username={comment.author.username}>
            <Avatar
              displayName={comment.author.displayName}
              size={size}
              username={comment.author.username}
            />
          </PersonLink>
          {rail === "line" && <span aria-hidden="true" className="thread-line" />}
          {rail === "stem" && <span aria-hidden="true" className="thread-curve__stem" />}
        </div>
        <div className="thread-main">
          <header className="post__head">
            <PersonLink className="post__author" username={comment.author.username}>
              {comment.author.displayName}
            </PersonLink>
            {eAutore && <span className="post__note">{t("post.comment.author_badge")}</span>}
            <time
              className="post__time"
              dateTime={comment.createdAt}
              title={quandoPerEsteso(comment.createdAt)}
            >
              {quandoBreve(comment.createdAt)}
            </time>
            {comment.editedAt != null && <span className="post__note">{t("post.edited")}</span>}
            <span className="grow" />
            {haAzioni && !preview && (
              <MenuAzioni
                etichetta={t("post.comment.actions.label", { name: comment.author.displayName })}
                occupato={busy}
                titolo={t("post.actions.more")}
                voci={[
                  ...(comment.canEdit === true
                    ? [
                        {
                          icon: "reply" as const,
                          id: "modifica",
                          onClick: () => {
                            setBozza(comment.body);
                            setModifica(true);
                          },
                          title: t("post.comment.actions.edit"),
                        },
                      ]
                    : []),
                  ...(comment.canModerate === true
                    ? [
                        {
                          icon: comment.hidden ? ("eye" as const) : ("eye-off" as const),
                          id: "nascondi",
                          onClick: () => void nascondi(),
                          title: comment.hidden
                            ? t("post.actions.show_again")
                            : t("post.actions.hide"),
                        },
                      ]
                    : []),
                  ...(comment.canDelete === true
                    ? [
                        {
                          conferma: {
                            etichetta: t("post.actions.confirm_delete"),
                            testo: t("post.comment.actions.delete_text"),
                            titolo: t("post.comment.actions.delete_title"),
                          },
                          id: "elimina",
                          onClick: () => void elimina(),
                          title: t("post.comment.actions.delete"),
                          tono: "danger" as const,
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </header>

          {comment.hidden && (
            <p className="post__note">
              {comment.body === ""
                ? t("post.comment.hidden.empty")
                : t("post.comment.hidden.visible_to_you")}
            </p>
          )}

          {modifica ? (
            <div className="stack--tight">
              <textarea
                aria-label={t("post.comment.edit.label")}
                className="input"
                maxLength={COMMENT_MAX_LENGTH}
                onChange={(event) => setBozza(event.target.value)}
                rows={4}
                value={bozza}
              />
              <div className="cluster">
                <Button disabled={busy || bozza.trim().length === 0} onClick={() => void salva()}>
                  {busy ? t("post.comment.edit.saving") : t("post.comment.edit.save")}
                </Button>
                <Button disabled={busy} onClick={() => setModifica(false)} variant="secondary">
                  {t("post.comment.edit.cancel")}
                </Button>
              </div>
            </div>
          ) : isRemote ? (
            loading ? (
              <p className="comment__text muted italic">{t("post.comment.remote.loading")}</p>
            ) : error ? (
              <p className="comment__text muted italic">{t("post.comment.remote.unreachable")}</p>
            ) : loadedBody !== null ? (
              <p
                className={
                  preview || onOpen !== undefined
                    ? "comment__text post__body--link"
                    : "comment__text"
                }
                onClick={preview || onOpen !== undefined ? apri : undefined}
                onKeyDown={
                  preview || onOpen !== undefined
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          apri();
                        }
                      }
                    : undefined
                }
                role={preview || onOpen !== undefined ? "link" : undefined}
                tabIndex={preview || onOpen !== undefined ? 0 : undefined}
              >
                {loadedBody}
              </p>
            ) : null
          ) : (
            comment.body !== "" && (
              <p
                className={
                  preview || onOpen !== undefined
                    ? "comment__text post__body--link"
                    : "comment__text"
                }
                onClick={preview || onOpen !== undefined ? apri : undefined}
                onKeyDown={
                  preview || onOpen !== undefined
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          apri();
                        }
                      }
                    : undefined
                }
                role={preview || onOpen !== undefined ? "link" : undefined}
                tabIndex={preview || onOpen !== undefined ? 0 : undefined}
              >
                {comment.body}
              </p>
            )
          )}

          <div className="post__actions">
            <button
              aria-label={liked ? t("post.like.remove") : t("post.like.add")}
              aria-pressed={liked}
              className="post__action"
              onClick={() => void cambiaLike()}
              type="button"
            >
              <Icon name="heart" size={18} />
              {likeCount > 0 && formatoNumero(likeCount)}
            </button>
            <button className="post__action" onClick={() => onReply(comment)} type="button">
              <Icon name="comment" size={18} />
              {t("post.comment.reply")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
