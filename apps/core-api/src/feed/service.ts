import { randomUUID } from "node:crypto";

import { FEED_PREDEFINITO } from "@estia/contracts";
import type {
  AuthenticatedUser,
  CommentView,
  ContentScope,
  FeedKind,
  LikeResponse,
  PostImageView,
  PostMediaInput,
  PostView,
  TimelinePage,
} from "@estia/contracts";

import type { Transactor } from "../db/database.js";
import { DomainError } from "../errors.js";
import type {
  CommentLikeRepository,
  CommentRepository,
  CommentWithAuthor,
  LikeRepository,
  PostRepository,
  PostWithContext,
} from "./repository.js";

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const HIDDEN_PLACEHOLDER = "";

/**
 * What the feed needs from the media module, and nothing more. Declared here
 * as a port so that neither module reaches into the other's tables
 * (ARCHITECTURE §3).
 */
export interface FeedMediaPort {
  attachToPost(caller: AuthenticatedUser, postId: string, media: readonly PostMediaInput[]): void;
  imagesFor(postIds: readonly string[]): Map<string, PostImageView[]>;
  releasePost(postId: string): Promise<void>;
}

export interface FeedServiceOptions {
  posts: PostRepository;
  comments: CommentRepository;
  likes: LikeRepository;
  commentLikes: CommentLikeRepository;
  media: FeedMediaPort;
  transaction: Transactor;
  now?: () => Date;
}

/** Moderation is a role, not an ownership: PRODUCT_VISION §7. */
function canModerate(caller: AuthenticatedUser): boolean {
  return caller.role === "instance_admin" || caller.role === "instance_moderator";
}

function encodeCursor(post: PostWithContext): string {
  return Buffer.from(`${post.createdAt}|${post.sequence}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; sequence: number } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const separator = decoded.indexOf("|");
  const sequence = Number(decoded.slice(separator + 1));

  if (separator <= 0 || !Number.isInteger(sequence)) {
    throw new DomainError("invalid_cursor", "The page cursor is not valid.", 400);
  }

  return { createdAt: decoded.slice(0, separator), sequence };
}

export class FeedService {
  private readonly posts: PostRepository;
  private readonly comments: CommentRepository;
  private readonly likes: LikeRepository;
  private readonly commentLikes: CommentLikeRepository;
  private readonly media: FeedMediaPort;
  private readonly transaction: Transactor;
  private readonly now: () => Date;

  public constructor(options: FeedServiceOptions) {
    this.posts = options.posts;
    this.comments = options.comments;
    this.likes = options.likes;
    this.commentLikes = options.commentLikes;
    this.media = options.media;
    this.transaction = options.transaction;
    this.now = options.now ?? ((): Date => new Date());
  }

  public createPost(
    caller: AuthenticatedUser,
    input: { body: string; scope?: ContentScope; media?: PostMediaInput[] },
  ): PostView {
    const body = input.body.trim();
    const media = input.media ?? [];

    // A photo is something to say, so an empty body is fine with images —
    // but a post with neither is nothing at all.
    if (body.length === 0 && media.length === 0) {
      throw new DomainError("empty_post", "A post needs something in it.", 400);
    }

    const id = randomUUID();

    // The post and its images are one write: a refused image must not leave a
    // post standing without it.
    this.transaction(() => {
      this.posts.create({
        authorId: caller.id,
        body,
        createdAt: this.now().toISOString(),
        deletedAt: null,
        editedAt: null,
        hiddenAt: null,
        id,
        // The default is the neighbourhood. Nothing reaches `public` by omission.
        scope: input.scope ?? "local",
      });

      // Throws if an image is not the caller's or is already used elsewhere.
      this.media.attachToPost(caller, id, media);
    });

    const created = this.posts.find(id, caller.id);

    if (created === undefined) {
      throw new DomainError("post_not_found", "The post could not be read back.", 500);
    }

    return this.toPostView(created, caller, this.media.imagesFor([id]).get(id) ?? []);
  }

  public timeline(
    caller: AuthenticatedUser,
    options: { cursor?: string; limit?: number; feed?: FeedKind; authorId?: string },
  ): TimelinePage {
    const limit = Math.min(options.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);
    const before = options.cursor === undefined ? undefined : decodeCursor(options.cursor);

    // One extra row tells us whether another page exists without a count.
    const rows = this.posts.timeline({
      callerId: caller.id,
      callerUsername: caller.username,
      // Chi non dice quale feed vuole legge quello di casa: è la stessa regola
      // dello scope, dove l'omissione non porta mai fuori dall'istanza.
      feed: options.feed ?? FEED_PREDEFINITO,
      limit: limit + 1,
      ...(options.authorId === undefined ? {} : { authorId: options.authorId }),
      ...(before === undefined ? {} : { before }),
    });

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    // One query for the whole page: a timeline must not cost a query per post.
    const images = this.media.imagesFor(page.map((post) => post.id));

    return {
      posts: page.map((post) => this.toPostView(post, caller, images.get(post.id) ?? [])),
      ...(rows.length > limit && last !== undefined ? { nextCursor: encodeCursor(last) } : {}),
    };
  }

  public getPost(caller: AuthenticatedUser, postId: string): PostView {
    const post = this.requirePost(caller, postId);

    return this.toPostView(post, caller, this.media.imagesFor([post.id]).get(post.id) ?? []);
  }

  public async deletePost(caller: AuthenticatedUser, postId: string): Promise<void> {
    const post = this.requirePost(caller, postId);

    if (post.authorId !== caller.id && !canModerate(caller)) {
      throw new DomainError("forbidden", "This is not yours to delete.", 403);
    }

    this.posts.softDelete(post.id, this.now().toISOString());
    // The post keeps a tombstone because federation will need one; its images
    // do not — nothing points at them any more, and they cost real space.
    await this.media.releasePost(post.id);
  }

  public setPostHidden(caller: AuthenticatedUser, postId: string, hidden: boolean): PostView {
    if (!canModerate(caller)) {
      throw new DomainError("forbidden", "Moderation is not allowed for your role.", 403);
    }

    const post = this.requirePost(caller, postId);

    this.posts.setHidden(
      post.id,
      hidden ? this.now().toISOString() : null,
      hidden ? caller.id : null,
    );

    return this.getPost(caller, postId);
  }

  public like(caller: AuthenticatedUser, postId: string, liked: boolean): LikeResponse {
    const post = this.requirePost(caller, postId);

    if (liked) {
      this.likes.add(post.id, caller.id, this.now().toISOString());
    } else {
      this.likes.remove(post.id, caller.id);
    }

    return { likeCount: this.likes.count(post.id), liked: this.likes.has(post.id, caller.id) };
  }

  public addComment(
    caller: AuthenticatedUser,
    postId: string,
    body: string,
    parentId?: string,
  ): CommentView {
    const post = this.requirePost(caller, postId);
    const trimmed = body.trim();

    if (trimmed.length === 0) {
      throw new DomainError("empty_comment", "A comment needs something in it.", 400);
    }

    let parent: ReturnType<CommentRepository["find"]>;

    if (parentId !== undefined) {
      parent = this.comments.find(parentId);

      if (parent === undefined || parent.postId !== post.id) {
        throw new DomainError("comment_not_found", "No such comment to reply to.", 404);
      }
    }

    const id = randomUUID();

    this.comments.create({
      authorId: caller.id,
      body: trimmed,
      createdAt: this.now().toISOString(),
      deletedAt: null,
      editedAt: null,
      hiddenAt: null,
      id,
      // Il padre immediato: ogni risposta è un commento pieno legato a quello
      // a cui risponde, non schiacciato sul primo livello (forma Threads).
      parentId: parent?.id ?? null,
      postId: post.id,
    });

    const created = this.comments
      .listForPost(post.id, caller.id)
      .find((comment) => comment.id === id);

    if (created === undefined) {
      throw new DomainError("comment_not_found", "The comment could not be read back.", 500);
    }

    return this.toCommentView(created, caller);
  }

  public listComments(caller: AuthenticatedUser, postId: string): CommentView[] {
    const post = this.requirePost(caller, postId);

    return this.comments
      .listForPost(post.id, caller.id)
      .map((comment) => this.toCommentView(comment, caller));
  }

  public updateComment(caller: AuthenticatedUser, commentId: string, body: string): CommentView {
    const comment = this.requireComment(commentId);
    const trimmed = body.trim();

    if (comment.authorId !== caller.id) {
      throw new DomainError("forbidden", "This is not yours to edit.", 403);
    }

    if (trimmed.length === 0) {
      throw new DomainError("empty_comment", "A comment needs something in it.", 400);
    }

    this.comments.update(comment.id, trimmed, this.now().toISOString());

    return this.reloadComment(caller, comment.id, comment.postId);
  }

  public setCommentHidden(
    caller: AuthenticatedUser,
    commentId: string,
    hidden: boolean,
  ): CommentView {
    if (!canModerate(caller)) {
      throw new DomainError("forbidden", "Only a moderator can hide a comment.", 403);
    }

    const comment = this.requireComment(commentId);

    this.comments.setHidden(
      comment.id,
      hidden ? this.now().toISOString() : null,
      hidden ? caller.id : null,
    );

    return this.reloadComment(caller, comment.id, comment.postId);
  }

  public likeComment(
    caller: AuthenticatedUser,
    commentId: string,
    liked: boolean,
  ): LikeResponse {
    const comment = this.requireComment(commentId);

    if (liked) {
      this.commentLikes.add(comment.id, caller.id, this.now().toISOString());
    } else {
      this.commentLikes.remove(comment.id, caller.id);
    }

    return {
      likeCount: this.commentLikes.count(comment.id),
      liked: this.commentLikes.has(comment.id, caller.id),
    };
  }

  public deleteComment(caller: AuthenticatedUser, commentId: string): void {
    const comment = this.requireComment(commentId);

    if (comment.authorId !== caller.id && !canModerate(caller)) {
      throw new DomainError("forbidden", "This is not yours to delete.", 403);
    }

    this.comments.softDelete(comment.id, this.now().toISOString());
  }

  private requirePost(caller: AuthenticatedUser, postId: string): PostWithContext {
    const post = this.posts.find(postId, caller.id);

    if (post === undefined) {
      throw new DomainError("post_not_found", "No such post.", 404);
    }

    return post;
  }

  private requireComment(commentId: string) {
    const comment = this.comments.find(commentId);

    if (comment === undefined) {
      throw new DomainError("comment_not_found", "No such comment.", 404);
    }

    return comment;
  }

  private reloadComment(
    caller: AuthenticatedUser,
    commentId: string,
    postId: string,
  ): CommentView {
    const reloaded = this.comments
      .listForPost(postId, caller.id)
      .find((entry) => entry.id === commentId);

    if (reloaded === undefined) {
      throw new DomainError("comment_not_found", "The comment could not be read back.", 500);
    }

    return this.toCommentView(reloaded, caller);
  }

  /**
   * Hidden content keeps its place in the timeline but loses its body for
   * everyone except its author and the moderators — so that a conversation
   * does not silently lose a piece and leave the replies dangling.
   */
  private toPostView(
    post: PostWithContext,
    caller: AuthenticatedUser,
    images: PostImageView[],
  ): PostView {
    const hidden = post.hiddenAt !== null;
    const mayRead = !hidden || post.authorId === caller.id || canModerate(caller);

    return {
      author: {
        displayName: post.authorDisplayName,
        id: post.authorId,
        username: post.authorUsername,
      },
      body: mayRead ? post.body : HIDDEN_PLACEHOLDER,
      canDelete: post.authorId === caller.id || canModerate(caller),
      canModerate: canModerate(caller),
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      editedAt: post.editedAt,
      hidden,
      id: post.id,
      // Hiding a post takes its images with the body: often the image *is*
      // what was hidden.
      images: mayRead ? images : [],
      likeCount: post.likeCount,
      liked: post.likedByCaller,
      scope: post.scope,
    };
  }

  private toCommentView(comment: CommentWithAuthor, caller: AuthenticatedUser): CommentView {
    const hidden = comment.hiddenAt !== null;
    const mayRead = !hidden || comment.authorId === caller.id || canModerate(caller);
    const own = comment.authorId === caller.id;

    return {
      author: {
        displayName: comment.authorDisplayName,
        id: comment.authorId,
        username: comment.authorUsername,
      },
      body: mayRead ? comment.body : HIDDEN_PLACEHOLDER,
      canDelete: own || canModerate(caller),
      canEdit: own,
      canModerate: canModerate(caller),
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
      hidden,
      id: comment.id,
      likeCount: comment.likeCount,
      liked: comment.likedByCaller,
      parentId: comment.parentId,
      postId: comment.postId,
    };
  }
}
