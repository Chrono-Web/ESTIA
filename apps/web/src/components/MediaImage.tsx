import { useEffect, useState } from "react";

import { mediaObjectUrl, type MediaVariant } from "../media.js";
import { useSignedIn } from "../state.js";

export interface MediaImageProps {
  id: string;
  variant: MediaVariant;
  alt: string;
  /** Reserved before the image arrives, so the timeline does not jump. */
  width: number;
  height: number;
  className?: string;
  onClick?: () => void;
}

/**
 * An image that carries the session with it (ADR 0012): fetched with the
 * authorisation header and shown from a blob URL, never from a URL that would
 * work on its own.
 */
export function MediaImage({
  alt,
  className,
  height,
  id,
  onClick,
  variant,
  width,
}: MediaImageProps): React.ReactElement {
  const { token } = useSignedIn();
  const [source, setSource] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;

    setFailed(false);
    mediaObjectUrl(token, id, variant)
      .then((url) => {
        if (current) {
          setSource(url);
        }
      })
      .catch(() => {
        if (current) {
          setFailed(true);
        }
      });

    return () => {
      current = false;
    };
  }, [id, token, variant]);

  if (failed) {
    return (
      <div className="media-missing" style={{ aspectRatio: `${width} / ${height}` }}>
        <span className="muted">Immagine non disponibile</span>
      </div>
    );
  }

  const shared = {
    className,
    height,
    style: { aspectRatio: `${width} / ${height}` },
    width,
  };

  if (source === undefined) {
    return <div {...shared} className={`media-loading ${className ?? ""}`} />;
  }

  if (onClick === undefined) {
    return <img {...shared} alt={alt} src={source} />;
  }

  return (
    <button className="media-button" onClick={onClick} type="button">
      <img {...shared} alt={alt} src={source} />
    </button>
  );
}
