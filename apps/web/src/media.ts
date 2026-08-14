/**
 * The client's half of the division of labour set out in ADR 0011: the browser
 * resizes and compresses before uploading, so the instance only ever handles
 * images that are already small. It is an optimisation, not a control — the
 * instance checks everything again on its own.
 */

/** Long side after compression. Comfortably more than any screen shows a feed image at. */
const MAX_SIDE = 1600;

/** Quality that keeps a photograph looking like a photograph. */
const QUALITY = 0.82;

export interface PreparedImage {
  blob: Blob;
  /** Blob URL for the preview, released by `releasePreparedImage`. */
  previewUrl: string;
  width: number;
  height: number;
}

export class ImagePreparationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ImagePreparationError";
  }
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);

  if (longest <= MAX_SIDE) {
    return { height, width };
  }

  const ratio = MAX_SIDE / longest;

  return {
    height: Math.max(1, Math.round(height * ratio)),
    width: Math.max(1, Math.round(width * ratio)),
  };
}

async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  // WebP first, JPEG where a browser cannot encode it: `toBlob` falls back to
  // PNG when it does not know the type, and a PNG photograph is enormous.
  for (const type of ["image/webp", "image/jpeg"]) {
    const encoded = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, QUALITY);
    });

    if (encoded !== null && encoded.type === type) {
      return encoded;
    }
  }

  throw new ImagePreparationError("Il browser non è riuscito a comprimere l'immagine.");
}

/**
 * Resizes and re-encodes a chosen file.
 *
 * Two things fall out of drawing it through a canvas, and both are wanted: the
 * orientation recorded by a phone is applied to the pixels rather than left as
 * a tag to be honoured later, and every other piece of metadata — the place the
 * photo was taken, first of all — does not survive the re-encoding.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImagePreparationError("Non riesco ad aprire questo file come immagine.");
  }

  try {
    const size = targetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");

    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext("2d");

    if (context === null) {
      throw new ImagePreparationError("Il browser non ha potuto elaborare l'immagine.");
    }

    context.drawImage(bitmap, 0, 0, size.width, size.height);

    const blob = await toBlob(canvas);

    return { blob, height: size.height, previewUrl: URL.createObjectURL(blob), width: size.width };
  } finally {
    bitmap.close();
  }
}

export function releasePreparedImage(image: PreparedImage): void {
  URL.revokeObjectURL(image.previewUrl);
}

/**
 * Images are fetched with the session token in `Authorization` and shown from a
 * blob URL, so that no token ever appears in a URL (ADR 0012).
 *
 * The cache is what makes that affordable: the timeline reloads after every
 * like or comment, and without it every image would be fetched again. Entries
 * are keyed by an identifier that never changes content, so they never go
 * stale — and they are dropped on sign-out, because they are session material.
 */
const objectUrls = new Map<string, Promise<string>>();

export type MediaVariant = "original" | "thumbnail";

export function mediaObjectUrl(token: string, id: string, variant: MediaVariant): Promise<string> {
  const path = variant === "thumbnail" ? `/api/v1/media/${id}/thumb` : `/api/v1/media/${id}`;
  const cached = objectUrls.get(path);

  if (cached !== undefined) {
    return cached;
  }

  const pending = (async (): Promise<string> => {
    const response = await fetch(path, { headers: { authorization: `Bearer ${token}` } });

    if (!response.ok) {
      throw new Error(`media ${response.status}`);
    }

    return URL.createObjectURL(await response.blob());
  })().catch((error: unknown) => {
    // A failure must not be remembered as a result: the next render retries.
    objectUrls.delete(path);

    throw error;
  });

  objectUrls.set(path, pending);

  return pending;
}

/** Called on sign-out: revoking a session must not leave its images behind. */
export function forgetLoadedMedia(): void {
  for (const pending of objectUrls.values()) {
    void pending.then(URL.revokeObjectURL).catch(() => undefined);
  }

  objectUrls.clear();
}
