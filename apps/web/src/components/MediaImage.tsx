import { useEffect, useMemo, useState } from "react";

import { mediaObjectUrl, type MediaVariant, type RemoteMediaRef } from "../media.js";
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
  /** Se l'immagine vive su un'altra istanza: la rotta proxy, non `/media`. */
  remoto?: RemoteMediaRef;
}

/**
 * Lo spazio che l'immagine occuperà, prima che arrivi.
 *
 * Un `<svg>` vuoto e non un attributo `style`: l'istanza serve `style-src
 * 'self'` senza `unsafe-inline`, quindi un `aspect-ratio` scritto sull'elemento
 * viene scartato dal browser e il segnaposto collassa. Le dimensioni di un SVG
 * sono attributi, non stile, e passano.
 */
function Ratio({ width, height }: { width: number; height: number }): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="media-ratio"
      focusable="false"
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    />
  );
}

/**
 * An image that carries the session with it (ADR 0012): fetched with the
 * authorisation header and shown from a blob URL, never from a URL that would
 * work on its own.
 *
 * Per l'immagine vera non serve nessun segnaposto: `width` e `height` come
 * attributi bastano al browser per riservare lo spazio giusto, ed è il modo per
 * cui quegli attributi esistono.
 */
export function MediaImage({
  alt,
  className,
  height,
  id,
  onClick,
  remoto,
  variant,
  width,
}: MediaImageProps): React.ReactElement {
  const { token } = useSignedIn();
  const [source, setSource] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  // `remoto` arriva costruito in linea da chi ci usa, quindi è un oggetto
  // nuovo a ogni render: dipenderne direttamente rifarebbe la fetch per
  // sempre. Si dipende dalle due primitive e si ricompone qui.
  const chiaveRemota = remoto?.instanceKey;
  const utenteRemoto = remoto?.utente;
  const bersaglio = useMemo(
    () =>
      chiaveRemota === undefined || utenteRemoto === undefined
        ? undefined
        : { instanceKey: chiaveRemota, utente: utenteRemoto },
    [chiaveRemota, utenteRemoto],
  );

  useEffect(() => {
    let current = true;

    setFailed(false);
    mediaObjectUrl(token, id, variant, bersaglio)
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
  }, [bersaglio, id, token, variant]);

  if (failed) {
    return (
      <div className={`media-missing ${className ?? ""}`}>
        <Ratio height={height} width={width} />
        <span className="muted">Immagine non disponibile</span>
      </div>
    );
  }

  if (source === undefined) {
    return (
      <div className={`media-loading ${className ?? ""}`}>
        <Ratio height={height} width={width} />
      </div>
    );
  }

  const image = <img alt={alt} className={className} height={height} src={source} width={width} />;

  return onClick === undefined ? (
    image
  ) : (
    <button className="media-button" onClick={onClick} type="button">
      {image}
    </button>
  );
}
