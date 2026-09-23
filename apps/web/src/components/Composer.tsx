import {
  MEDIA_ALT_TEXT_MAX_LENGTH,
  MEDIA_MAX_PER_POST,
  POST_MAX_LENGTH,
  scopeDelFeed,
  type FeedKind,
  type PostMediaInput,
} from "@estia/contracts";
import { useRef, useState } from "react";

import { api, ApiError } from "../api.js";
import { t } from "../i18n/index.js";
import { ImagePreparationError, prepareImage, releasePreparedImage } from "../media.js";
import type { PreparedImage } from "../media.js";
import { nomeIstanza, useSignedIn } from "../state.js";
import { Alert, Avatar, Button, IconButton, TextField } from "../ui/index.js";

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
    return t("media.upload.failed");
  }

  switch (error.code) {
    case "media_quota_exceeded":
      return t("media.upload.quota");
    case "unsupported_media_type":
      return t("media.upload.unsupported");
    case "invalid_image":
      return t("media.upload.invalid");
    default:
      return error.status === 413 ? t("media.upload.too_large") : t("media.upload.failed");
  }
}

export interface ComposerProps {
  /** Il feed in cui si sta scrivendo: è lui a decidere chi leggerà. */
  feed: FeedKind;
  onPublished: () => void | Promise<void>;
}

/**
 * Scrivere un post.
 *
 * Nessun menu a tendina per la cerchia: ADR 0018 chiede **un pulsante per
 * feed**, perché una scelta che decide il pubblico di ciò che scrivi va vista
 * senza aprirla. Qui il feed lo decide la lente, e il pulsante lo dice.
 *
 * La forma è quella di Threads: avatar e nome, testo, toolbar immagini,
 * destinazione e Pubblica in un piede. Si apre da `/scrivi`, che è l'unico
 * modo di scrivere un post: la riga compatta nel feed è esistita fino al
 * 2026-08-21 e non è sopravvissuta al passaggio al pannello.
 */
export function Composer({ feed, onPublished }: ComposerProps): React.ReactElement {
  const { instance, token, user } = useSignedIn();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const room = MEDIA_MAX_PER_POST - attachments.length;
  const destinazione =
    feed === "locale"
      ? t("feed.composer.audience.instance", { instance: nomeIstanza(instance) })
      : t("feed.composer.audience.network");

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
        // Lo scope lo decide il feed, e non un menu: da qui l'invariante di ADR
        // 0002 — «mai `public` per assenza» — è vero per costruzione.
        scope: scopeDelFeed(feed),
        ...(media.length === 0 ? {} : { media }),
      });

      for (const entry of attachments) {
        releasePreparedImage(entry.image);
      }

      setDraft("");
      setAttachments([]);
      await onPublished();
    } catch {
      setError(t("feed.composer.error.publish"));
    } finally {
      setBusy(false);
    }
  };

  const fileField = (
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
  );

  const allegati =
    attachments.length > 0 ? (
      <div className="attachments">
        {attachments.map((entry) => (
          <div className="attachment" key={entry.key}>
            <img alt="" src={entry.image.previewUrl} />

            <div className="grow">
              <TextField
                hint={
                  entry.error ??
                  (entry.mediaId === undefined
                    ? t("feed.composer.attachment.uploading")
                    : t("feed.composer.attachment.size", {
                        height: String(entry.image.height),
                        size: String(Math.round(entry.image.blob.size / 1024)),
                        width: String(entry.image.width),
                      }))
                }
                label={t("feed.composer.attachment.description")}
                maxLength={MEDIA_ALT_TEXT_MAX_LENGTH}
                onChange={(event) => describe(entry.key, event.target.value)}
                placeholder={t("feed.composer.attachment.description_placeholder")}
                value={entry.altText}
              />
            </div>

            <IconButton
              icon="close"
              label={t("feed.composer.attachment.remove")}
              onClick={() => remove(entry.key)}
            />
          </div>
        ))}
      </div>
    ) : null;

  return (
    <form className="composer composer--modal" onSubmit={(event) => void publish(event)}>
      <div className="composer__corpo">
        <Avatar displayName={user.displayName} size="md" username={user.username} />

        <div className="composer__main">
          <div className="composer__chi">
            <span className="composer__nome">{user.username}</span>
          </div>

          <label className="only-screen-reader" htmlFor="composer-testo">
            {feed === "locale"
              ? t("feed.composer.label.instance", { instance: nomeIstanza(instance) })
              : t("feed.composer.label.network")}
          </label>
          <textarea
            className="composer__text"
            id="composer-testo"
            maxLength={POST_MAX_LENGTH}
            onChange={(event) => {
              setError(undefined);
              setDraft(event.target.value);
            }}
            placeholder={t("feed.composer.placeholder")}
            rows={3}
            value={draft}
          />

          {allegati}

          {error !== undefined && <Alert tone="error">{error}</Alert>}

          {/*
            Chi leggerà, detto a parole e per esteso: è la seconda delle tre
            difese contro il pubblicare nel posto sbagliato, e una difesa che
            vive in un `title` non esiste — il tooltip non c'è sul telefono e
            non c'è per chi arriva con la tastiera.
          */}
          <p className="composer__destinazione">{destinazione}</p>

          {fileField}

          <div className="composer__toolbar">
            <IconButton
              disabled={room <= 0 || busy}
              icon="image"
              label={room <= 0 ? t("feed.composer.add_photo_full") : t("feed.composer.add_photo")}
              onClick={() => fileInput.current?.click()}
            />
          </div>
        </div>
      </div>

      <div className="composer__piede">
        <span className="composer__a-chi">
          {feed === "locale" ? nomeIstanza(instance) : t("feed.composer.to.network")}
        </span>
        <Button className="composer__pubblica" disabled={!canPublish} type="submit">
          {busy ? t("feed.composer.submitting") : t("feed.composer.submit")}
        </Button>
      </div>
    </form>
  );
}
