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
  RemoteCommentRepository,
  RemoteCommentRecord,
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
  /**
   * Come `imagesFor`, più la dimensione dell'originale: è ciò che `bacheca`
   * mette sul filo, perché chi legge possa rifiutare prima di chiedere.
   */
  imagesForWire(postIds: readonly string[]): Map<
    string,
    {
      id: string;
      width: number;
      height: number;
      thumbWidth: number;
      thumbHeight: number;
      altText: string;
      byteSize: number;
    }[]
  >;
  /**
   * I byte di un'immagine **se** appartiene a questo autore. Stessa assenza
   * per «non c'è» e per «c'è ma non è sua»: altrimenti la federazione
   * indovinerebbe gli id (ADR 0020 §1).
   */
  readOwnedBy(
    id: string,
    ownerId: string,
    variant: "original" | "thumbnail",
  ): Promise<{ bytes: Uint8Array; mediaType: string; byteSize: number } | undefined>;
  releasePost(postId: string): Promise<void>;
}

export interface FeedServiceOptions {
  posts: PostRepository;
  comments: CommentRepository;
  likes: LikeRepository;
  commentLikes: CommentLikeRepository;
  remoteComments: RemoteCommentRepository;
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
  private readonly remoteComments: RemoteCommentRepository;
  private readonly media: FeedMediaPort;
  private readonly transaction: Transactor;
  private readonly now: () => Date;

  public constructor(options: FeedServiceOptions) {
    this.posts = options.posts;
    this.comments = options.comments;
    this.likes = options.likes;
    this.commentLikes = options.commentLikes;
    this.remoteComments = options.remoteComments;
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

    const created = this.posts.find(id, caller);

    if (created === undefined) {
      throw new DomainError("post_not_found", "The post could not be read back.", 500);
    }

    return this.toPostView(created, caller, this.media.imagesFor([id]).get(id) ?? []);
  }

  public timeline(
    caller: AuthenticatedUser,
    options: {
      cursor?: string;
      limit?: number;
      feed?: FeedKind;
      authorId?: string;
      /**
       * La finestra del feed composto ([ADR 0023] §3), quando questa è la metà
       * di casa di una pagina che arriva da più macchine. Inclusiva: chi
       * compone scarta i post già mostrati, e a quel punto `cursor` non serve.
       */
      atOrBefore?: string;
    },
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
      ...(options.atOrBefore === undefined ? {} : { atOrBefore: options.atOrBefore }),
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
    const post = this.requirePostForModeration(caller, postId);

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

    const post = this.requirePostForModeration(caller, postId);

    this.posts.setHidden(
      post.id,
      hidden ? this.now().toISOString() : null,
      hidden ? caller.id : null,
    );

    // Riletto dalla stessa porta della moderazione: passare da quella normale
    // darebbe 404 a chi ha appena nascosto un post che non gli era destinato.
    const riletto = this.requirePostForModeration(caller, postId);

    return this.toPostView(
      riletto,
      caller,
      this.media.imagesFor([riletto.id]).get(riletto.id) ?? [],
    );
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

  public addRemoteComment(caller: AuthenticatedUser, postId: string, body: string): CommentView {
    const trimmed = body.trim();

    if (trimmed.length === 0) {
      throw new DomainError("empty_comment", "A comment needs something in it.", 400);
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
      parentId: null,
      postId,
    });

    const created = this.comments.find(id);

    if (created === undefined) {
      throw new DomainError("comment_not_found", "The comment could not be read back.", 500);
    }

    return this.toCommentView(
      {
        ...created,
        authorDisplayName: caller.displayName,
        authorUsername: caller.username,
        likeCount: 0,
        likedByCaller: false,
      },
      caller,
    );
  }

  public deleteRemoteComment(caller: AuthenticatedUser, commentId: string): void {
    const comment = this.comments.find(commentId);

    if (comment === undefined || (comment.authorId !== caller.id && !canModerate(caller))) {
      return;
    }

    this.comments.softDelete(commentId, this.now().toISOString());
  }

  public listComments(caller: AuthenticatedUser, postId: string): CommentView[] {
    const post = this.requirePost(caller, postId);

    const locale = this.comments
      .listForPost(post.id, caller.id)
      .map((comment) => this.toCommentView(comment, caller));

    const remote = this.remoteComments
      .list(post.id)
      .map((comment) => this.toRemoteCommentView(comment, caller));

    return [...locale, ...remote].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  public getPublicComment(commentId: string): { body: string } | undefined {
    const comment = this.comments.find(commentId);
    if (comment === undefined || comment.deletedAt !== null || comment.hiddenAt !== null) {
      return undefined;
    }
    return { body: comment.body };
  }

  public updateComment(caller: AuthenticatedUser, commentId: string, body: string): CommentView {
    const result = this.requireComment(caller, commentId);

    if (result.kind === "remote") {
      throw new DomainError("forbidden", "Cannot edit remote comments.", 403);
    }

    const comment = result.comment;
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

    const result = this.requireComment(caller, commentId);

    if (result.kind === "remote") {
      if (hidden) {
        this.remoteComments.hide({
          commentId,
          hiddenBy: caller.id,
          at: this.now().toISOString(),
        });
      } else {
        this.remoteComments.unhide({ commentId });
      }

      const updated = this.remoteComments.find(commentId);
      if (updated === undefined) {
        throw new DomainError("comment_not_found", "No such remote comment.", 404);
      }

      return this.toRemoteCommentView(updated, caller);
    }

    const comment = result.comment;

    this.comments.setHidden(
      comment.id,
      hidden ? this.now().toISOString() : null,
      hidden ? caller.id : null,
    );

    return this.reloadComment(caller, comment.id, comment.postId);
  }

  public likeComment(caller: AuthenticatedUser, commentId: string, liked: boolean): LikeResponse {
    const result = this.requireComment(caller, commentId);

    if (result.kind === "remote") {
      throw new DomainError("forbidden", "Cannot like remote comments.", 403);
    }

    const comment = result.comment;

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
    const result = this.requireComment(caller, commentId);

    if (result.kind === "remote") {
      throw new DomainError("forbidden", "Cannot delete remote comments here.", 403);
    }

    const comment = result.comment;

    if (comment.authorId !== caller.id && !canModerate(caller)) {
      throw new DomainError("forbidden", "This is not yours to delete.", 403);
    }

    this.comments.softDelete(comment.id, this.now().toISOString());
  }

  /**
   * Il post, se chi chiede può leggerlo.
   *
   * Il permesso è lo stesso del feed — una condizione sola, scritta nel
   * repository — e chi non ce l'ha riceve **404 e non 403**: distinguere «non
   * esiste» da «non puoi» direbbe a chiunque, un indirizzo per volta, chi ha
   * scritto che cosa. È la stessa regola che i profili applicano già.
   */
  private requirePost(caller: AuthenticatedUser, postId: string): PostWithContext {
    const post = this.posts.find(postId, caller);

    if (post === undefined) {
      throw new DomainError("post_not_found", "No such post.", 404);
    }

    return post;
  }

  /**
   * Lo stesso post per chi modera, permesso o no.
   *
   * Chiamata solo da nascondi ed elimina: un moderatore deve poter intervenire
   * anche su ciò che non gli era destinato, altrimenti la superficie di rete
   * non sarebbe moderabile affatto. Chi non modera passa dalla porta normale e
   * resta soggetto al permesso.
   */
  private requirePostForModeration(caller: AuthenticatedUser, postId: string): PostWithContext {
    const post = canModerate(caller)
      ? this.posts.findForModeration(postId, caller.id)
      : this.posts.find(postId, caller);

    if (post === undefined) {
      throw new DomainError("post_not_found", "No such post.", 404);
    }

    return post;
  }

  /**
   * Il commento, **e il permesso sul post che lo contiene**.
   *
   * Il secondo controllo non è ridondante: un commento si raggiunge per
   * identificatore, e senza di esso si potrebbe mettere mi piace o rispondere
   * dentro una conversazione che non si ha il diritto di leggere. Chi modera
   * passa comunque, per la stessa ragione per cui passa sui post.
   */
  private requireComment(
    caller: AuthenticatedUser,
    commentId: string,
  ):
    | { kind: "local"; comment: CommentWithAuthor }
    | { kind: "remote"; comment: RemoteCommentRecord } {
    const comment = this.comments.find(commentId);

    if (comment !== undefined) {
      const isLocalPost =
        (canModerate(caller)
          ? this.posts.findForModeration(comment.postId, caller.id)
          : this.posts.find(comment.postId, caller)) !== undefined;

      if (!isLocalPost) {
        if (comment.authorId !== caller.id && !canModerate(caller)) {
          throw new DomainError("comment_not_found", "No such comment.", 404);
        }
        return {
          kind: "local",
          comment: {
            ...comment,
            authorDisplayName: caller.displayName,
            authorUsername: caller.username,
            likeCount: 0,
            likedByCaller: false,
          },
        };
      }

      this.requirePostForModeration(caller, comment.postId);
      const withAuthor = this.comments
        .listForPost(comment.postId, caller.id)
        .find((c) => c.id === commentId);
      if (withAuthor === undefined) {
        throw new DomainError("comment_not_found", "No such comment.", 404);
      }
      return { kind: "local", comment: withAuthor };
    }

    const remote = this.remoteComments.find(commentId);

    if (remote !== undefined) {
      this.requirePostForModeration(caller, remote.postId);
      return { kind: "remote", comment: remote };
    }

    throw new DomainError("comment_not_found", "No such comment.", 404);
  }

  private reloadComment(caller: AuthenticatedUser, commentId: string, postId: string): CommentView {
    const reloaded = this.comments
      .listForPost(postId, caller.id)
      .find((entry) => entry.id === commentId);

    if (reloaded === undefined) {
      const comment = this.comments.find(commentId);
      if (comment !== undefined) {
        return this.toCommentView(
          {
            ...comment,
            authorDisplayName: caller.displayName,
            authorUsername: caller.username,
            likeCount: 0,
            likedByCaller: false,
          },
          caller,
        );
      }
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
    /*
     * Una lapide non è un commento: c'è solo perché regge delle risposte, e su
     * di essa non si fa niente. Niente corpo, niente mi piace, nessuna azione —
     * altrimenti si offrirebbe di rispondere a qualcosa che non c'è più.
     */
    const deleted = comment.deletedAt !== null;

    if (deleted) {
      return {
        author: {
          displayName: comment.authorDisplayName,
          id: comment.authorId,
          username: comment.authorUsername,
        },
        body: HIDDEN_PLACEHOLDER,
        canDelete: false,
        canEdit: false,
        canModerate: false,
        createdAt: comment.createdAt,
        deleted: true,
        editedAt: null,
        hidden: false,
        id: comment.id,
        likeCount: 0,
        liked: false,
        parentId: comment.parentId,
        postId: comment.postId,
      };
    }

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
      deleted: false,
      editedAt: comment.editedAt,
      hidden,
      id: comment.id,
      likeCount: comment.likeCount,
      liked: comment.likedByCaller,
      parentId: comment.parentId,
      postId: comment.postId,
    };
  }

  private toRemoteCommentView(
    comment: RemoteCommentRecord,
    caller: AuthenticatedUser,
  ): CommentView {
    const hidden = comment.hiddenAt !== null;

    return {
      author: {
        displayName: comment.username,
        id: comment.instanceKey,
        username: comment.username,
      },
      body: "", // Empty: resolved by the client
      canDelete: canModerate(caller),
      canEdit: false,
      canModerate: canModerate(caller),
      createdAt: comment.createdAt,
      deleted: false,
      editedAt: null,
      hidden,
      id: comment.id,
      likeCount: 0,
      liked: false,
      parentId: null,
      postId: comment.postId,
      remoteCommentId: comment.remoteCommentId,
      remoteInstanceKey: comment.instanceKey,
      remoteUsername: comment.username,
    };
  }
}
