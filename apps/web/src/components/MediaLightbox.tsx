import { type PostImageView } from "@estia/contracts";
import { useEffect, useRef } from "react";

import { formatoNumero, t } from "../i18n/index.js";
import type { RemoteMediaRef } from "../media.js";
import { Icon, IconButton } from "../ui/index.js";
import { MediaImage } from "./MediaImage.js";

export interface MediaLightboxProps {
  images: PostImageView[];
  /** Quale immagine aprire; se manca, la prima. */
  initialId: string;
  authorName: string;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  showLikeAction: boolean;
  showCommentAction: boolean;
  /** Proxy verso un'altra istanza, quando le foto non sono di casa. */
  remoto?: RemoteMediaRef;
  onClose: () => void;
  onLike: () => void;
  onComment: () => void;
}

/**
 * Le foto a schermo intero, come nel feed di Threads: sfondo nero, indietro
 * in alto a sinistra, like e commenti in basso sopra l'immagine. Con più di
 * una foto si scorre in orizzontale — la stessa direzione del carousel nel
 * post, così il gesto non cambia.
 *
 * È un `<dialog>` con `showModal()`, come lo Sheet: fuoco chiuso dentro,
 * Esc che chiude, resto della pagina inerte. Un `div` fixed lo rifarebbe male.
 */
export function MediaLightbox({
  images,
  initialId,
  authorName,
  liked,
  likeCount,
  commentCount,
  showLikeAction,
  showCommentAction,
  remoto,
  onClose,
  onLike,
  onComment,
}: MediaLightboxProps): React.ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dialog.current;

    if (element === null) {
      return;
    }

    if (!element.open) {
      element.showModal();
    }

    const apri = (): void => {
      const slide = stage.current?.querySelector<HTMLElement>(
        `[data-media-id="${CSS.escape(initialId)}"]`,
      );
      slide?.scrollIntoView({ inline: "center", block: "nearest" });
    };

    requestAnimationFrame(apri);
  }, [initialId]);

  return (
    <dialog
      aria-label={t("media.lightbox.label", { name: authorName })}
      className="lightbox"
      onClose={onClose}
      ref={dialog}
    >
      <div className="lightbox__chrome">
        <IconButton
          className="lightbox__chrome-btn"
          icon="close"
          label={t("media.lightbox.close")}
          onClick={onClose}
        />
      </div>

      <div className="lightbox__stage" ref={stage}>
        {images.map((image) => (
          <div className="lightbox__slide" data-media-id={image.id} key={image.id}>
            <MediaImage
              alt={
                image.altText === "" ? t("media.alt_default", { name: authorName }) : image.altText
              }
              height={image.height}
              id={image.id}
              variant="original"
              width={image.width}
              {...(remoto === undefined ? {} : { remoto })}
            />
          </div>
        ))}
      </div>

      {(showLikeAction || showCommentAction) && (
        <div className="lightbox__actions">
          {showLikeAction && (
            <button
              aria-label={liked ? t("post.like.remove") : t("post.like.add")}
              aria-pressed={liked}
              className="post__action lightbox__action"
              onClick={onLike}
              type="button"
            >
              <Icon name="heart" size={22} />
              {likeCount > 0 && formatoNumero(likeCount)}
            </button>
          )}

          {showCommentAction && (
            <button
              aria-label={t("post.comments.count", { count: commentCount })}
              className="post__action lightbox__action"
              onClick={onComment}
              type="button"
            >
              <Icon name="comment" size={22} />
              {commentCount > 0 && formatoNumero(commentCount)}
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}
