import {
  MEDIA_ALT_TEXT_MAX_LENGTH,
  MEDIA_MAX_PER_POST,
  POST_MAX_LENGTH,
  type PostMediaInput,
} from "@estia/contracts";
import { useRef, useState } from "react";

import { api, ApiError } from "../api.js";
import { ImagePreparationError, prepareImage, releasePreparedImage } from "../media.js";
import type { PreparedImage } from "../media.js";
import { useSignedIn } from "../state.js";

interface Attachment {
  /** Local key: the media identifier only exists once the upload succeeds. */
  key: string;
  image: PreparedImage;
  altText: string;
  mediaId?: string;
  error?: string;
}

/** Says what went wrong in the words of the thing that went wrong. */
function uploadFailure(error: unknown): string {
  if (error instanceof ImagePreparationError) {
    return error.message;
  }

  if (!(error instanceof ApiError)) {
    return "Non sono riuscito a caricare l'immagine.";
  }

  switch (error.code) {
    case "media_quota_exceeded":
      return "Hai esaurito lo spazio per le immagini. Elimina qualche vecchio messaggio.";
    case "unsupported_media_type":
      return "Questo file non è un'immagine JPEG, PNG o WebP.";
    case "invalid_image":
      return "Questo file non è un'immagine leggibile.";
    default:
      return error.status === 413
        ? "L'immagine è troppo grande per questa istanza."
        : "Non sono riuscito a caricare l'immagine.";
  }
}

export interface ComposerProps {
  onPublished: () => void | Promise<void>;
}

export function Composer({ onPublished }: ComposerProps): React.ReactElement {
  const { instance, token, user } = useSignedIn();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const room = MEDIA_MAX_PER_POST - attachments.length;

  const attach = async (files: FileList): Promise<void> => {
    setError(undefined);

    for (const file of Array.from(files).slice(0, MEDIA_MAX_PER_POST - attachments.length)) {
      const key = `${file.name}-${String(Date.now())}-${String(Math.random())}`;

      try {
        // Compressed here, on the machine of whoever is publishing: it is their
        // processor that does the heavy work, not the instance's (ADR 0011).
        const image = await prepareImage(file);

        setAttachments((current) => [...current, { altText: "", image, key }]);

        const uploaded = await api.uploadMedia(token, image.blob);

        setAttachments((current) =>
          current.map((entry) => (entry.key === key ? { ...entry, mediaId: uploaded.id } : entry)),
        );
      } catch (failure) {
        const message = uploadFailure(failure);

        setAttachments((current) =>
          current.some((entry) => entry.key === key)
            ? current.map((entry) => (entry.key === key ? { ...entry, error: message } : entry))
            : current,
        );
        setError(message);
      }
    }

    if (fileInput.current !== null) {
      // Cleared so that choosing the same file again still fires a change.
      fileInput.current.value = "";
    }
  };

  const remove = (key: string): void => {
    setError(undefined);
    setAttachments((current) => {
      const going = current.find((entry) => entry.key === key);

      if (going !== undefined) {
        releasePreparedImage(going.image);
      }

      return current.filter((entry) => entry.key !== key);
    });
  };

  const describe = (key: string, altText: string): void => {
    setAttachments((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, altText } : entry)),
    );
  };

  const ready = attachments.filter((entry) => entry.mediaId !== undefined);
  // An attachment still uploading — or one that failed and is still sitting
  // there — holds the post back. A refused file that never became an
  // attachment does not: its message is a warning, and someone who only wanted
  // to write two lines must still be able to send them.
  const pending = attachments.length !== ready.length;
  const canPublish = !busy && !pending && (draft.trim().length > 0 || ready.length > 0);

  const publish = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    const media: PostMediaInput[] = ready.map((entry) => ({
      id: entry.mediaId!,
      ...(entry.altText.trim().length === 0 ? {} : { altText: entry.altText.trim() }),
    }));

    try {
      await api.createPost(token, {
        body: draft,
        ...(media.length === 0 ? {} : { media }),
      });

      for (const entry of attachments) {
        releasePreparedImage(entry.image);
      }

      setDraft("");
      setAttachments([]);
      await onPublished();
    } catch {
      setError("Non sono riuscito a pubblicare.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <form onSubmit={(event) => void publish(event)}>
        <label>
          <span className="label-text">Scrivi all&apos;istanza</span>
          <textarea
            maxLength={POST_MAX_LENGTH}
            onChange={(event) => {
              setError(undefined);
              setDraft(event.target.value);
            }}
            placeholder={`Cosa succede in ${instance.name}, ${user.displayName}?`}
            value={draft}
          />
        </label>

        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((entry) => (
              <div className="attachment" key={entry.key}>
                <img alt="" src={entry.image.previewUrl} />

                <div className="grow">
                  <label>
                    <span className="label-text">Descrizione</span>
                    <input
                      maxLength={MEDIA_ALT_TEXT_MAX_LENGTH}
                      onChange={(event) => describe(entry.key, event.target.value)}
                      placeholder="Che cosa si vede? Serve a chi non può vederla."
                      value={entry.altText}
                    />
                  </label>

                  <div className="muted">
                    {entry.error ??
                      (entry.mediaId === undefined
                        ? "Carico…"
                        : `${String(entry.image.width)}×${String(entry.image.height)} pixel, ${String(Math.round(entry.image.blob.size / 1024))} kB`)}
                  </div>
                </div>

                <button className="danger" onClick={() => remove(entry.key)} type="button">
                  Togli
                </button>
              </div>
            ))}
          </div>
        )}

        {error !== undefined && <div className="alert error">{error}</div>}

        <input
          accept="image/jpeg,image/png,image/webp"
          hidden
          multiple
          onChange={(event) => {
            if (event.target.files !== null) {
              void attach(event.target.files);
            }
          }}
          ref={fileInput}
          type="file"
        />

        <div className="actions">
          <button disabled={!canPublish} type="submit">
            {busy ? "Pubblico…" : "Pubblica"}
          </button>

          <button
            className="secondary"
            disabled={room <= 0 || busy}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            {room <= 0 ? "Immagini al massimo" : "Aggiungi foto"}
          </button>

          {/* Said plainly, once, where it matters (PRODUCT_VISION §3). */}
          <span className="muted">Lo vedono solo i membri di {instance.name}.</span>
        </div>
      </form>
    </div>
  );
}
