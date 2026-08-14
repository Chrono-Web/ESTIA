import type { DatabaseSync } from "node:sqlite";

import type { ContentScope } from "@estia/contracts";

export interface PostRecord {
  id: string;
  authorId: string;
  body: string;
  scope: ContentScope;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  hiddenAt: string | null;
}

/** A post joined with what the feed needs to render it in one pass. */
export interface PostWithContext extends PostRecord {
  authorUsername: string;
  authorDisplayName: string;
  likeCount: number;
  commentCount: number;
  likedByCaller: boolean;
}

export interface CommentRecord {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  hiddenAt: string | null;
}

export interface CommentWithAuthor extends CommentRecord {
  authorUsername: string;
  authorDisplayName: string;
}

export interface TimelineQuery {
  callerId: string;
  limit: number;
  /** Exclusive: the page starts strictly after this position. */
  before?: { createdAt: string; id: string };
}

export interface PostRepository {
  create(record: PostRecord): void;
  find(id: string, callerId: string): PostWithContext | undefined;
  timeline(query: TimelineQuery): PostWithContext[];
  softDelete(id: string, deletedAt: string): void;
  setHidden(id: string, hiddenAt: string | null, hiddenBy: string | null): void;
}

export interface CommentRepository {
  create(record: CommentRecord): void;
  find(id: string): CommentRecord | undefined;
  listForPost(postId: string): CommentWithAuthor[];
  softDelete(id: string, deletedAt: string): void;
  setHidden(id: string, hiddenAt: string | null, hiddenBy: string | null): void;
}

export interface LikeRepository {
  add(postId: string, userId: string, createdAt: string): void;
  remove(postId: string, userId: string): void;
  count(postId: string): number;
  has(postId: string, userId: string): boolean;
}

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  scope: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  hidden_at: string | null;
  username: string;
  display_name: string;
  like_count: number;
  comment_count: number;
  liked: number;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  deleted_at: string | null;
  hidden_at: string | null;
  username: string;
  display_name: string;
};

const POST_SELECT = `
  SELECT p.id, p.author_id, p.body, p.scope, p.created_at, p.edited_at, p.deleted_at, p.hidden_at,
         u.username, u.display_name,
         (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL)
           AS comment_count,
         EXISTS (SELECT 1 FROM post_likes k WHERE k.post_id = p.id AND k.user_id = ?) AS liked
  FROM posts p
  JOIN users u ON u.id = p.author_id
`;

function toPost(row: PostRow): PostWithContext {
  return {
    authorDisplayName: row.display_name,
    authorId: row.author_id,
    authorUsername: row.username,
    body: row.body,
    commentCount: Number(row.comment_count),
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    editedAt: row.edited_at,
    hiddenAt: row.hidden_at,
    id: row.id,
    likeCount: Number(row.like_count),
    likedByCaller: Number(row.liked) === 1,
    scope: row.scope as ContentScope,
  };
}

function toComment(row: CommentRow): CommentWithAuthor {
  return {
    authorDisplayName: row.display_name,
    authorId: row.author_id,
    authorUsername: row.username,
    body: row.body,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    hiddenAt: row.hidden_at,
    id: row.id,
    postId: row.post_id,
  };
}

export class SqlitePostRepository implements PostRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: PostRecord): void {
    this.database
      .prepare(
        `INSERT INTO posts (id, author_id, body, scope, created_at, edited_at, deleted_at, hidden_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.authorId,
        record.body,
        record.scope,
        record.createdAt,
        record.editedAt,
        record.deletedAt,
        record.hiddenAt,
      );
  }

  public find(id: string, callerId: string): PostWithContext | undefined {
    const row = this.database
      .prepare(`${POST_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`)
      .get(callerId, id) as PostRow | undefined;

    return row === undefined ? undefined : toPost(row);
  }

  public timeline(query: TimelineQuery): PostWithContext[] {
    // Chronological, newest first, with the id breaking ties so that two posts
    // written in the same millisecond cannot hide each other across pages.
    const rows =
      query.before === undefined
        ? this.database
            .prepare(
              `${POST_SELECT}
               WHERE p.deleted_at IS NULL
               ORDER BY p.created_at DESC, p.id DESC
               LIMIT ?`,
            )
            .all(query.callerId, query.limit)
        : this.database
            .prepare(
              `${POST_SELECT}
               WHERE p.deleted_at IS NULL AND (p.created_at, p.id) < (?, ?)
               ORDER BY p.created_at DESC, p.id DESC
               LIMIT ?`,
            )
            .all(query.callerId, query.before.createdAt, query.before.id, query.limit);

    return (rows as PostRow[]).map(toPost);
  }

  public softDelete(id: string, deletedAt: string): void {
    // Soft delete: federation will need a tombstone (ARCHITECTURE §4).
    this.database.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").run(deletedAt, id);
  }

  public setHidden(id: string, hiddenAt: string | null, hiddenBy: string | null): void {
    this.database
      .prepare("UPDATE posts SET hidden_at = ?, hidden_by = ? WHERE id = ?")
      .run(hiddenAt, hiddenBy, id);
  }
}

export class SqliteCommentRepository implements CommentRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: CommentRecord): void {
    this.database
      .prepare(
        `INSERT INTO comments (id, post_id, author_id, body, created_at, deleted_at, hidden_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.postId,
        record.authorId,
        record.body,
        record.createdAt,
        record.deletedAt,
        record.hiddenAt,
      );
  }

  public find(id: string): CommentRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, post_id, author_id, body, created_at, deleted_at, hidden_at
         FROM comments WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as Omit<CommentRow, "username" | "display_name"> | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      hiddenAt: row.hidden_at,
      id: row.id,
      postId: row.post_id,
    };
  }

  public listForPost(postId: string): CommentWithAuthor[] {
    const rows = this.database
      .prepare(
        `SELECT c.id, c.post_id, c.author_id, c.body, c.created_at, c.deleted_at, c.hidden_at,
                u.username, u.display_name
         FROM comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.post_id = ? AND c.deleted_at IS NULL
         ORDER BY c.created_at`,
      )
      .all(postId) as CommentRow[];

    return rows.map(toComment);
  }

  public softDelete(id: string, deletedAt: string): void {
    this.database.prepare("UPDATE comments SET deleted_at = ? WHERE id = ?").run(deletedAt, id);
  }

  public setHidden(id: string, hiddenAt: string | null, hiddenBy: string | null): void {
    this.database
      .prepare("UPDATE comments SET hidden_at = ?, hidden_by = ? WHERE id = ?")
      .run(hiddenAt, hiddenBy, id);
  }
}

export class SqliteLikeRepository implements LikeRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public add(postId: string, userId: string, createdAt: string): void {
    // The primary key makes a second like a no-op rather than an error.
    this.database
      .prepare("INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)")
      .run(postId, userId, createdAt);
  }

  public remove(postId: string, userId: string): void {
    this.database
      .prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?")
      .run(postId, userId);
  }

  public count(postId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS total FROM post_likes WHERE post_id = ?")
      .get(postId) as { total: number };

    return Number(row.total);
  }

  public has(postId: string, userId: string): boolean {
    return (
      this.database
        .prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?")
        .get(postId, userId) !== undefined
    );
  }
}
