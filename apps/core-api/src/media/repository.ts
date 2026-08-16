import type { DatabaseSync } from "node:sqlite";

import type { ImageFormat } from "./image.js";

export interface MediaRecord {
  id: string;
  ownerId: string;
  /** Null until the image is attached to a post: an orphan waiting for one. */
  postId: string | null;
  position: number;
  format: ImageFormat;
  byteSize: number;
  width: number;
  height: number;
  thumbByteSize: number;
  thumbWidth: number;
  thumbHeight: number;
  altText: string;
  createdAt: string;
  attachedAt: string | null;
  deletedAt: string | null;
}

export interface MediaRepository {
  create(record: MediaRecord): void;
  find(id: string): MediaRecord | undefined;
  listForPosts(postIds: readonly string[]): MediaRecord[];
  attach(id: string, postId: string, position: number, altText: string, attachedAt: string): void;
  /** Bytes held by one member, which is what the quota is measured against. */
  bytesUsedBy(ownerId: string): number;
  /** Everything stored, all owners together: what a backup would have to carry. */
  bytesStored(): number;
  softDelete(ids: readonly string[], deletedAt: string): void;
  listOrphans(createdBefore: string): MediaRecord[];
  listForPost(postId: string): MediaRecord[];
}

type MediaRow = {
  id: string;
  owner_id: string;
  post_id: string | null;
  position: number;
  format: string;
  byte_size: number;
  width: number;
  height: number;
  thumb_byte_size: number;
  thumb_width: number;
  thumb_height: number;
  alt_text: string;
  created_at: string;
  attached_at: string | null;
  deleted_at: string | null;
};

const COLUMNS = `id, owner_id, post_id, position, format, byte_size, width, height,
                 thumb_byte_size, thumb_width, thumb_height, alt_text,
                 created_at, attached_at, deleted_at`;

function toRecord(row: MediaRow): MediaRecord {
  return {
    altText: row.alt_text,
    attachedAt: row.attached_at,
    byteSize: Number(row.byte_size),
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    format: row.format as ImageFormat,
    height: Number(row.height),
    id: row.id,
    ownerId: row.owner_id,
    position: Number(row.position),
    postId: row.post_id,
    thumbByteSize: Number(row.thumb_byte_size),
    thumbHeight: Number(row.thumb_height),
    thumbWidth: Number(row.thumb_width),
    width: Number(row.width),
  };
}

export class SqliteMediaRepository implements MediaRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: MediaRecord): void {
    this.database
      .prepare(
        `INSERT INTO media (${COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.ownerId,
        record.postId,
        record.position,
        record.format,
        record.byteSize,
        record.width,
        record.height,
        record.thumbByteSize,
        record.thumbWidth,
        record.thumbHeight,
        record.altText,
        record.createdAt,
        record.attachedAt,
        record.deletedAt,
      );
  }

  public find(id: string): MediaRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${COLUMNS} FROM media WHERE id = ? AND deleted_at IS NULL`)
      .get(id) as MediaRow | undefined;

    return row === undefined ? undefined : toRecord(row);
  }

  public listForPosts(postIds: readonly string[]): MediaRecord[] {
    if (postIds.length === 0) {
      return [];
    }

    const placeholders = postIds.map(() => "?").join(", ");
    const rows = this.database
      .prepare(
        `SELECT ${COLUMNS} FROM media
         WHERE post_id IN (${placeholders}) AND deleted_at IS NULL
         ORDER BY position, created_at`,
      )
      .all(...postIds) as MediaRow[];

    return rows.map(toRecord);
  }

  public listForPost(postId: string): MediaRecord[] {
    return this.listForPosts([postId]);
  }

  public attach(
    id: string,
    postId: string,
    position: number,
    altText: string,
    attachedAt: string,
  ): void {
    this.database
      .prepare(
        `UPDATE media SET post_id = ?, position = ?, alt_text = ?, attached_at = ?
         WHERE id = ? AND post_id IS NULL AND deleted_at IS NULL`,
      )
      .run(postId, position, altText, attachedAt, id);
  }

  public bytesUsedBy(ownerId: string): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(SUM(byte_size + thumb_byte_size), 0) AS total
         FROM media WHERE owner_id = ? AND deleted_at IS NULL`,
      )
      .get(ownerId) as { total: number };

    return Number(row.total);
  }

  public bytesStored(): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(SUM(byte_size + thumb_byte_size), 0) AS total
         FROM media WHERE deleted_at IS NULL`,
      )
      .get() as { total: number };

    return Number(row.total);
  }

  public softDelete(ids: readonly string[], deletedAt: string): void {
    if (ids.length === 0) {
      return;
    }

    const placeholders = ids.map(() => "?").join(", ");

    this.database
      .prepare(`UPDATE media SET deleted_at = ? WHERE id IN (${placeholders})`)
      .run(deletedAt, ...ids);
  }

  public listOrphans(createdBefore: string): MediaRecord[] {
    const rows = this.database
      .prepare(
        `SELECT ${COLUMNS} FROM media
         WHERE post_id IS NULL AND deleted_at IS NULL AND created_at < ?`,
      )
      .all(createdBefore) as MediaRow[];

    return rows.map(toRecord);
  }
}
