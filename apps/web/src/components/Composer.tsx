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
  /** Il feed in cui si sta scrivendo: è lui a decidere chi leggerà. */
  feed: FeedKind;
  /** Quante persone di un'altra istanza aspettano invano. Zero le nasconde. */
  followerRemoti?: number;
  onPublished: () => void | Promise<void>;
}

/**
 * Scrivere, dentro il feed in cui si sta.
 *
 * Nessun menu a tendina per la cerchia: ADR 0018 chiede **un pulsante per
 * feed**, perché una scelta che decide il pubblico di ciò che scrivi va vista
 * senza aprirla. Qui il feed lo decide la lente, e il pulsante lo dice.
 */
export function Composer({
  feed,
  followerRemoti = 0,
  onPublished,
}: ComposerProps): React.ReactElement {
  const { instance, token, user } = useSignedIn();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [aperto, setAperto] = useState(false);
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
      setAperto(false);
      await onPublished();
    } catch {
      setError("Non sono riuscito a pubblicare.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={aperto ? "composer composer--aperto" : "composer"}
      onSubmit={(event) => void publish(event)}
    >
      <Avatar displayName={user.displayName} size="md" username={user.username} />

      <div className="composer__main">
        <label className="only-screen-reader" htmlFor="composer-testo">
          {feed === "locale" ? `Scrivi a ${nomeIstanza(instance)}` : "Scrivi a chi ti segue"}
        </label>
        <textarea
          className="composer__text"
          id="composer-testo"
          maxLength={POST_MAX_LENGTH}
          onChange={(event) => {
            setError(undefined);
            setDraft(event.target.value);
          }}
          onFocus={() => setAperto(true)}
          rows={1}
          placeholder={
            feed === "locale"
              ? `Cosa succede in ${nomeIstanza(instance)}, ${user.displayName}?`
              : "Che cosa vuoi dire a chi ti segue?"
          }
          value={draft}
        />

        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((entry) => (
              <div className="attachment" key={entry.key}>
                <img alt="" src={entry.image.previewUrl} />

                <div className="grow">
                  <TextField
                    hint={
                      entry.error ??
                      (entry.mediaId === undefined
                        ? "Carico…"
                        : `${String(entry.image.width)}×${String(entry.image.height)} pixel, ${String(Math.round(entry.image.blob.size / 1024))} kB`)
                    }
                    label="Descrizione"
                    maxLength={MEDIA_ALT_TEXT_MAX_LENGTH}
                    onChange={(event) => describe(entry.key, event.target.value)}
                    placeholder="Che cosa si vede? Serve a chi non può vederla."
                    value={entry.altText}
                  />
                </div>

                <IconButton
                  icon="close"
                  label="Togli l'immagine"
                  onClick={() => remove(entry.key)}
                />
              </div>
            ))}
          </div>
        )}

        {error !== undefined && <Alert tone="error">{error}</Alert>}

        {/*
          Chi leggerà, detto a parole e non solo dal colore della cornice: è la
          seconda delle tre difese contro il pubblicare nel posto sbagliato.
          Compare solo a composer aperto — a riposo non deve rubare viewport.
        */}
        {aperto && (
          <span className="composer__destinazione">
            {feed === "locale"
              ? `Lo vedono solo i membri di ${nomeIstanza(instance)}. Non esce da questa istanza.`
              : "Lo vedono le persone che ti seguono, e non compare nel feed dell'istanza."}
          </span>
        )}

        {/*
          Il limite dichiarato invece che nascosto (ADR 0018): i contenuti si
          visitano e non si replicano, e il messaggio che va a prenderli non
          esiste ancora nel protocollo. Compare solo a chi ha davvero qualcuno
          dall'altra parte — a tutti gli altri sarebbe rumore.
        */}
        {aperto && feed === "seguiti" && followerRemoti > 0 && (
          <Alert>
            {followerRemoti === 1
              ? "Una persona che ti segue sta su un'altra istanza e non riuscirà a leggerlo"
              : `${String(followerRemoti)} persone che ti seguono stanno su altre istanze e non riusciranno a leggerlo`}
            : i post non si copiano fra istanze, e il modo di andarli a prendere è ancora da
            costruire. Chi ti segue da qui lo vede subito.
          </Alert>
        )}

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

        {aperto && (
          <div className="composer__actions">
            <Button disabled={!canPublish} type="submit">
              {busy ? "Pubblico…" : "Pubblica"}
            </Button>

            <Button
              disabled={room <= 0 || busy}
              icon="image"
              onClick={() => fileInput.current?.click()}
              variant="secondary"
            >
              {room <= 0 ? "Immagini al massimo" : "Foto"}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
