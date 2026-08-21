import { type PostImageView } from "@estia/contracts";
import { useEffect, useRef } from "react";

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
  /** False sui post di un'altra casa: cuori e risposte vivono lì. */
  showActions: boolean;
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
  showActions,
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
      aria-label={`Fotografie di ${authorName}`}
      className="lightbox"
      onClose={onClose}
      ref={dialog}
    >
      <div className="lightbox__chrome">
        <IconButton
          className="lightbox__chrome-btn"
          icon="close"
          label="Chiudi"
          onClick={onClose}
        />
      </div>

      <div className="lightbox__stage" ref={stage}>
        {images.map((image) => (
          <div className="lightbox__slide" data-media-id={image.id} key={image.id}>
            <MediaImage
              alt={image.altText === "" ? `Immagine pubblicata da ${authorName}` : image.altText}
              height={image.height}
              id={image.id}
              variant="original"
              width={image.width}
            />
          </div>
        ))}
      </div>

      {showActions && (
        <div className="lightbox__actions">
          <button
            aria-label={liked ? "Togli il mi piace" : "Metti mi piace"}
            aria-pressed={liked}
            className="post__action lightbox__action"
            onClick={onLike}
            type="button"
          >
            <Icon name="heart" size={22} />
            {likeCount > 0 && likeCount}
          </button>

          <button
            aria-label={commentCount === 1 ? "1 commento" : `${String(commentCount)} commenti`}
            className="post__action lightbox__action"
            onClick={onComment}
            type="button"
          >
            <Icon name="comment" size={22} />
            {commentCount > 0 && commentCount}
          </button>
        </div>
      )}
    </dialog>
  );
}
