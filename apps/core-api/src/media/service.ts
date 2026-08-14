import { randomUUID } from "node:crypto";

import type { MediaConfig } from "@estia/config";
import type { AuthenticatedUser, MediaView, PostImageView } from "@estia/contracts";

import { DomainError } from "../errors.js";
import {
  IMAGE_MEDIA_TYPES,
  makeThumbnail,
  readDimensions,
  sniffFormat,
  stripMetadata,
} from "./image.js";
import type { ImageFormat } from "./image.js";
import type { MediaRecord, MediaRepository } from "./repository.js";
import type { MediaStorage } from "./storage.js";

/**
 * Long side of the generated thumbnail. Chosen for the width the feed gives an
 * image on screen, not for a round number.
 */
const THUMBNAIL_MAX_SIDE = 640;

/**
 * How long an uploaded image may sit without a post before the sweep collects
 * it. Long enough that a slow composer never loses a photo, short enough that
 * an abandoned upload is not stored forever.
 */
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface StoredMedia {
  bytes: Uint8Array;
  mediaType: string;
  byteSize: number;
}

export interface MediaServiceOptions {
  repository: MediaRepository;
  storage: MediaStorage;
  limits: MediaConfig;
  now?: () => Date;
}

/** Two files per image: the original as uploaded, and the thumbnail we made. */
function originalKey(id: string, format: ImageFormat): string {
  return `${id.slice(0, 2)}/${id}.${format}`;
}

function thumbnailKey(id: string): string {
  return `${id.slice(0, 2)}/${id}.thumb.webp`;
}

export class MediaService {
  private readonly repository: MediaRepository;
  private readonly storage: MediaStorage;
  private readonly limits: MediaConfig;
  private readonly now: () => Date;

  public constructor(options: MediaServiceOptions) {
    this.repository = options.repository;
    this.storage = options.storage;
    this.limits = options.limits;
    this.now = options.now ?? ((): Date => new Date());
  }

  /**
   * Accepts an upload, in the order ADR 0011 prescribes — and the order is the
   * point, because each check protects the one after it:
   *
   * 1. the type comes from the bytes, never from what the request claims;
   * 2. the size in bytes and **in pixels** is refused before anything decodes,
   *    since a small file can expand into gigabytes of memory;
   * 3. the quota is applied before writing, not after;
   * 4. the image is decoded — which is the real proof that it is an image —
   *    and only then written, atomically, under a name we generated.
   *
   * The browser compressing before upload is an optimisation. None of this
   * depends on it having happened.
   */
  public async upload(caller: AuthenticatedUser, bytes: Uint8Array): Promise<MediaView> {
    const format = sniffFormat(bytes);

    if (format === undefined) {
      throw new DomainError("unsupported_media_type", "Accetto immagini JPEG, PNG o WebP.", 415);
    }

    if (bytes.byteLength > this.limits.maxBytes) {
      throw new DomainError("media_too_large", "L'immagine supera la dimensione consentita.", 413);
    }

    const dimensions = readDimensions(bytes, format);

    if (dimensions === undefined) {
      throw new DomainError("invalid_image", "Questo file non è un'immagine leggibile.", 400);
    }

    if (dimensions.width * dimensions.height > this.limits.maxPixels) {
      throw new DomainError(
        "media_too_many_pixels",
        "L'immagine ha troppi pixel per essere elaborata.",
        413,
      );
    }

    // Cheap and approximate on purpose: the exact size is known only after the
    // thumbnail exists, but the quota has to bite before anything is written.
    const used = this.repository.bytesUsedBy(caller.id);

    if (used + bytes.byteLength > this.limits.quotaBytesPerUser) {
      throw new DomainError(
        "media_quota_exceeded",
        "Hai esaurito lo spazio per le immagini. Elimina qualche vecchio messaggio.",
        413,
      );
    }

    const thumbnail = await this.makeThumbnailOrReject(bytes, format);
    // Kept as uploaded, minus what is not needed to draw it: a photo from a
    // phone carries the coordinates of where it was taken, and the feed of a
    // neighbourhood is the last place they should end up by accident.
    const stored = stripMetadata(bytes, format);
    const id = randomUUID();

    // The path comes from an identifier the instance generated, never from the
    // name of the uploaded file (PROJECT_SPEC §9).
    await this.storage.write(originalKey(id, format), stored);

    try {
      await this.storage.write(thumbnailKey(id), thumbnail.bytes);

      this.repository.create({
        altText: "",
        attachedAt: null,
        byteSize: stored.byteLength,
        createdAt: this.now().toISOString(),
        deletedAt: null,
        format,
        height: dimensions.height,
        id,
        ownerId: caller.id,
        position: 0,
        postId: null,
        thumbByteSize: thumbnail.bytes.byteLength,
        thumbHeight: thumbnail.height,
        thumbWidth: thumbnail.width,
        width: dimensions.width,
      });
    } catch (error) {
      // Nothing references these yet, so failing here must not leave them.
      await this.storage.delete(originalKey(id, format));
      await this.storage.delete(thumbnailKey(id));

      throw error;
    }

    return {
      byteSize: stored.byteLength,
      height: dimensions.height,
      id,
      thumbHeight: thumbnail.height,
      thumbWidth: thumbnail.width,
      width: dimensions.width,
    };
  }

  /**
   * Claims images for a post. Only the uploader may attach their own, and only
   * once: an image already attached elsewhere is refused rather than moved.
   */
  public attachToPost(
    caller: AuthenticatedUser,
    postId: string,
    media: readonly { id: string; altText?: string }[],
  ): void {
    const at = this.now().toISOString();

    media.forEach((entry, position) => {
      const record = this.repository.find(entry.id);

      if (record === undefined || record.ownerId !== caller.id) {
        throw new DomainError("media_not_found", "Immagine non trovata.", 404);
      }

      if (record.postId !== null) {
        throw new DomainError("media_already_used", "Immagine già usata in un messaggio.", 409);
      }

      this.repository.attach(entry.id, postId, position, entry.altText?.trim() ?? "", at);
    });
  }

  public imagesFor(postIds: readonly string[]): Map<string, PostImageView[]> {
    const images = new Map<string, PostImageView[]>();

    for (const record of this.repository.listForPosts(postIds)) {
      if (record.postId === null) {
        continue;
      }

      const list = images.get(record.postId) ?? [];

      list.push(toImageView(record));
      images.set(record.postId, list);
    }

    return images;
  }

  /** Reads bytes back for a member. Membership is checked by the route. */
  public async read(id: string, variant: "original" | "thumbnail"): Promise<StoredMedia> {
    const record = this.repository.find(id);

    if (record === undefined) {
      throw new DomainError("media_not_found", "Immagine non trovata.", 404);
    }

    const key =
      variant === "original" ? originalKey(record.id, record.format) : thumbnailKey(record.id);

    try {
      const bytes = await this.storage.read(key);

      return {
        byteSize: bytes.byteLength,
        bytes,
        mediaType: variant === "original" ? IMAGE_MEDIA_TYPES[record.format] : "image/webp",
      };
    } catch {
      // The row says it exists and the file does not: the instance says so
      // plainly rather than answering with something else.
      throw new DomainError("media_missing", "L'immagine non è più disponibile.", 410);
    }
  }

  /** Releases the images of a deleted post: the tombstone is the post's, not the bytes'. */
  public async releasePost(postId: string): Promise<void> {
    await this.forget(this.repository.listForPost(postId));
  }

  /**
   * Collects uploads that never became a post. Without this, every abandoned
   * composer would leave a file nobody can reach and a quota nobody can free
   * (ARCHITECTURE §5).
   */
  public async sweepOrphans(): Promise<number> {
    const cutoff = new Date(this.now().getTime() - ORPHAN_MAX_AGE_MS).toISOString();
    const orphans = this.repository.listOrphans(cutoff);

    await this.forget(orphans);

    return orphans.length;
  }

  private async forget(records: readonly MediaRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }

    // The row goes first: after this the image is unreachable, so a failure
    // while removing files leaves wasted space, never a dangling reference.
    this.repository.softDelete(
      records.map((record) => record.id),
      this.now().toISOString(),
    );

    for (const record of records) {
      await this.storage.delete(originalKey(record.id, record.format));
      await this.storage.delete(thumbnailKey(record.id));
    }
  }

  private async makeThumbnailOrReject(
    bytes: Uint8Array,
    format: ImageFormat,
  ): Promise<{ bytes: Uint8Array; width: number; height: number }> {
    try {
      return await makeThumbnail(bytes, format, THUMBNAIL_MAX_SIDE);
    } catch {
      throw new DomainError("invalid_image", "Questo file non è un'immagine leggibile.", 400);
    }
  }
}

function toImageView(record: MediaRecord): PostImageView {
  return {
    altText: record.altText,
    height: record.height,
    id: record.id,
    thumbHeight: record.thumbHeight,
    thumbWidth: record.thumbWidth,
    width: record.width,
  };
}
