import type { DatabaseSync } from "node:sqlite";

import type { ContentScope, FeedKind } from "@estia/contracts";

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
  /**
   * Insertion order. Two posts written in the same millisecond share a
   * `createdAt`, and an opaque id breaks that tie at random — which would let
   * the timeline shuffle itself. This is the monotonic tiebreaker.
   */
  sequence: number;
  authorUsername: string;
  authorDisplayName: string;
  likeCount: number;
  commentCount: number;
  likedByCaller: boolean;
}

export interface CommentRecord {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  hiddenAt: string | null;
}

export interface CommentWithAuthor extends CommentRecord {
  authorUsername: string;
  authorDisplayName: string;
  likeCount: number;
  likedByCaller: boolean;
}

export interface TimelineQuery {
  callerId: string;
  /** Serve al feed di rete: la lista che autorizza indicizza per nome. */
  callerUsername: string;
  limit: number;
  /** Quale delle due superfici si sta leggendo. I post non si sovrappongono. */
  feed: FeedKind;
  /**
   * Una persona sola, per la sua pagina.
   *
   * Si aggiunge al filtro del feed invece di sostituirlo, ed è la ragione per
   * cui la pagina di qualcuno non è una scorciatoia: se in modalità rete quella
   * persona non ti ha accettato, la sua pagina è vuota come il tuo feed.
   */
  authorId?: string;
  /** Exclusive: the page starts strictly after this position. */
  before?: { createdAt: string; sequence: number };
  /**
   * Inclusivo, e serve al feed di rete: quando la pagina si compone da più
   * macchine il cursore è **un istante** e non una posizione in questa tabella
   * ([ADR 0023] §3), perché una posizione qui non vuol dire niente là. Chi
   * compone rimuove poi i post già mostrati, che è il prezzo di un confine
   * inclusivo e costa meno di un post perso.
   */
  atOrBefore?: string;
}

/**
 * Che cosa di una persona di qui può leggere qualcuno di fuori ([ADR 0023]).
 *
 * Non è la timeline con un filtro in più: è una domanda diversa, e tenerle
 * separate è ciò che impedisce a un permesso di sbagliarsi. Qui non c'è nessun
 * chiamante di casa — niente «mi piace» da segnare, nessuna moderazione da
 * concedere — e la regola è secca: **soltanto ciò che l'autore ha scritto per
 * i propri follower**, mai il feed locale, che ADR 0020 dichiara non servibile
 * a nessuno per nessun motivo.
 */
export interface BoardQuery {
  authorIds: readonly string[];
  /** L'istante da cui guardare indietro, incluso: la finestra di ADR 0023 §3. */
  atOrBefore?: string;
  limit: number;
}

export interface PostRepository {
  create(record: PostRecord): void;
  find(id: string, caller: { id: string; username: string }): PostWithContext | undefined;
  findForModeration(id: string, callerId: string): PostWithContext | undefined;
  timeline(query: TimelineQuery): PostWithContext[];
  board(query: BoardQuery): PostWithContext[];
  softDelete(id: string, deletedAt: string): void;
  setHidden(id: string, hiddenAt: string | null, hiddenBy: string | null): void;
}

export interface CommentRepository {
  create(record: CommentRecord): void;
  find(id: string): CommentRecord | undefined;
  listForPost(postId: string, callerId: string): CommentWithAuthor[];
  update(id: string, body: string, editedAt: string): void;
  softDelete(id: string, deletedAt: string): void;
  setHidden(id: string, hiddenAt: string | null, hiddenBy: string | null): void;
}

export interface LikeRepository {
  add(postId: string, userId: string, createdAt: string): void;
  remove(postId: string, userId: string): void;
  count(postId: string): number;
  has(postId: string, userId: string): boolean;
}

export interface CommentLikeRepository {
  add(commentId: string, userId: string, createdAt: string): void;
  remove(commentId: string, userId: string): void;
  count(commentId: string): number;
  has(commentId: string, userId: string): boolean;
}

type PostRow = {
  id: string;
  sequence: number;
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
  parent_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  hidden_at: string | null;
  username: string;
  display_name: string;
  like_count: number;
  liked: number;
};

const POST_SELECT = `
  SELECT p.id, p.rowid AS sequence,
         p.author_id, p.body, p.scope, p.created_at, p.edited_at, p.deleted_at, p.hidden_at,
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
    sequence: Number(row.sequence),
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
    editedAt: row.edited_at,
    hiddenAt: row.hidden_at,
    id: row.id,
    likeCount: Number(row.like_count),
    likedByCaller: Number(row.liked) === 1,
    parentId: row.parent_id,
    postId: row.post_id,
  };
}

/**
 * Che cosa entra in ciascuno dei due feed.
 *
 * `locale` è esattamente ciò che non esce di casa. `seguiti` è il resto: i
 * propri post, e quelli delle persone che hanno **accettato** di farsi leggere.
 *
 * La lista consultata è `followers` e non `following`, e la differenza non è di
 * comodità: [ADR 0022] dice che `followers` è la metà che **autorizza** — sta
 * in casa di chi è seguito, ed è lei a decidere chi può leggere. Interrogare
 * quella significa che togliere un follower toglie i post dal feed **subito**,
 * senza spedire niente a nessuno, che è esattamente la proprietà promessa. Le
 * due metà possono divergere di proposito, e `following` è la metà che non
 * decide: un follow accettato non aggiorna la riga di chi ha chiesto.
 *
 * Il limite è dichiarato invece che nascosto: le persone seguite su **un'altra
 * istanza** non compaiono qui, perché i loro post stanno sulla loro macchina e
 * il protocollo di [ADR 0021] non ha ancora un modo per andarli a prendere.
 * L'interfaccia lo dice; un feed che li omettesse in silenzio sarebbe
 * indistinguibile da uno rotto.
 */
function feedFilter(
  feed: FeedKind,
  caller: { id: string; username: string },
): { sql: string; params: string[] } {
  if (feed === "locale") {
    return { params: [], sql: "p.scope = 'local'" };
  }

  const permesso = leggibileDa(caller);

  return {
    params: permesso.params,
    sql: `p.scope <> 'local' AND ${permesso.sql}`,
  };
}

/**
 * Chi può leggere un post, in una condizione sola.
 *
 * Vive qui e non in due posti perché è **la stessa domanda** che si fa il feed
 * e che si fa la lettura di un post per indirizzo: se le due si scrivessero
 * separate, prima o poi divergerebbero — ed è esattamente com'è successo. Fino
 * al 2026-08-21 il feed filtrava e `GET /posts/:id` no, quindi un post di rete
 * si leggeva, si commentava e si metteva mi piace aprendone l'indirizzo, anche
 * senza essere fra chi l'autore aveva accettato.
 *
 * `local` è di tutta l'istanza per definizione. Il resto è di chi lo scrive e
 * di chi ha **accettato** di farsi leggere — la lista `followers`, che ADR 0022
 * mette in casa di chi è seguito proprio perché sia lei ad autorizzare.
 */
function leggibileDa(caller: { id: string; username: string }): {
  sql: string;
  params: string[];
} {
  return {
    params: [caller.id, caller.username],
    sql: `(p.scope = 'local'
           OR p.author_id = ?
           OR p.author_id IN (
             SELECT f.user_id
             FROM followers f
             WHERE f.follower_instance = 'locale'
               AND f.follower_username = ?
               AND f.state = 'accettato'
           ))`,
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

  /**
   * Un post, **se chi chiede può leggerlo**.
   *
   * È la lettura normale, quella dietro `GET /posts/:id`. Chi non ha il
   * permesso ottiene `undefined`, che diventa un 404 e non un 403: distinguere
   * «non esiste» da «non puoi» direbbe a chiunque, un indirizzo per volta, chi
   * ha scritto che cosa.
   */
  public find(id: string, caller: { id: string; username: string }): PostWithContext | undefined {
    const permesso = leggibileDa(caller);
    const row = this.database
      .prepare(`${POST_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL AND ${permesso.sql}`)
      .get(caller.id, id, ...permesso.params) as PostRow | undefined;

    return row === undefined ? undefined : toPost(row);
  }

  /**
   * Lo stesso post senza il filtro del permesso, per chi modera.
   *
   * Separata di proposito: chi la chiama deve averlo deciso. Un moderatore
   * dev'essere in grado di nascondere anche ciò che non gli era destinato —
   * altrimenti la superficie di rete non sarebbe moderabile affatto — ed è la
   * stessa fiducia che il codice gli accorda già sui contenuti nascosti.
   */
  public findForModeration(id: string, callerId: string): PostWithContext | undefined {
    const row = this.database
      .prepare(`${POST_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`)
      .get(callerId, id) as PostRow | undefined;

    return row === undefined ? undefined : toPost(row);
  }

  public timeline(query: TimelineQuery): PostWithContext[] {
    const filtro = feedFilter(query.feed, {
      id: query.callerId,
      username: query.callerUsername,
    });
    const conAutore =
      query.authorId === undefined ? filtro.sql : `${filtro.sql} AND p.author_id = ?`;
    const sql = query.atOrBefore === undefined ? conAutore : `${conAutore} AND p.created_at <= ?`;
    const conAutoreParams =
      query.authorId === undefined ? filtro.params : [...filtro.params, query.authorId];
    const params =
      query.atOrBefore === undefined ? conAutoreParams : [...conAutoreParams, query.atOrBefore];

    // Chronological, newest first. The tiebreaker is insertion order, not the
    // opaque id: ids are random, so using them would shuffle posts written in
    // the same millisecond.
    const rows =
      query.before === undefined
        ? this.database
            .prepare(
              `${POST_SELECT}
               WHERE p.deleted_at IS NULL AND ${sql}
               ORDER BY p.created_at DESC, p.rowid DESC
               LIMIT ?`,
            )
            .all(query.callerId, ...params, query.limit)
        : this.database
            .prepare(
              `${POST_SELECT}
               WHERE p.deleted_at IS NULL AND ${sql}
                 AND (p.created_at, p.rowid) < (?, ?)
               ORDER BY p.created_at DESC, p.rowid DESC
               LIMIT ?`,
            )
            .all(
              query.callerId,
              ...params,
              query.before.createdAt,
              query.before.sequence,
              query.limit,
            );

    return (rows as PostRow[]).map(toPost);
  }

  /**
   * La bacheca di alcune persone di qui, come la vede chi legge da fuori.
   *
   * Tre esclusioni, e ognuna è una promessa: `scope = 'local'` non esce di casa
   * mai; un post cancellato non c'è più davvero, ed è la promessa che il
   * modello a visita compra; un post nascosto da chi modera non viaggia con il
   * corpo svuotato, perché fuori non esiste la conversazione a cui quel vuoto
   * serviva a non lasciare risposte appese.
   */
  public board(query: BoardQuery): PostWithContext[] {
    if (query.authorIds.length === 0) {
      return [];
    }

    const segnaposti = query.authorIds.map(() => "?").join(", ");
    const finestra = query.atOrBefore === undefined ? "" : "AND p.created_at <= ?";
    const rows = this.database
      .prepare(
        `${POST_SELECT}
         WHERE p.deleted_at IS NULL
           AND p.hidden_at IS NULL
           AND p.scope <> 'local'
           AND p.author_id IN (${segnaposti})
           ${finestra}
         ORDER BY p.created_at DESC, p.rowid DESC
         LIMIT ?`,
      )
      // Nessun chiamante di casa: il posto del `liked` lo prende una stringa
      // che non è l'id di nessuno, e il conto dei cuori resta quello vero.
      .all(
        "",
        ...query.authorIds,
        ...(query.atOrBefore === undefined ? [] : [query.atOrBefore]),
        query.limit,
      );

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
        `INSERT INTO comments (id, post_id, parent_id, author_id, body, created_at, edited_at, deleted_at, hidden_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.postId,
        record.parentId,
        record.authorId,
        record.body,
        record.createdAt,
        record.editedAt,
        record.deletedAt,
        record.hiddenAt,
      );
  }

  public find(id: string): CommentRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT id, post_id, parent_id, author_id, body, created_at, edited_at, deleted_at, hidden_at
         FROM comments WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id) as
      Omit<CommentRow, "username" | "display_name" | "like_count" | "liked"> | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      editedAt: row.edited_at,
      hiddenAt: row.hidden_at,
      id: row.id,
      parentId: row.parent_id,
      postId: row.post_id,
    };
  }

  /**
   * I commenti di un post, **più le lapidi che tengono su un ramo**.
   *
   * Un commento eliminato di solito sparisce. Ma se qualcuno gli aveva
   * risposto, farlo sparire e basta stacca quelle risposte dall'albero: restano
   * nel database e nel conteggio, e nessuna interfaccia le raggiunge più —
   * nemmeno per moderarle. Quindi un eliminato resta **se e solo se** ha ancora
   * un discendente vivo, con il corpo vuotato, e serve solo a reggere il ramo.
   *
   * La ricorsione risale dai vivi ai loro antenati, e non scende: così una
   * catena di due eliminati sopra una risposta viva resta intera, e nessun
   * ramo si stacca a metà.
   */
  public listForPost(postId: string, callerId: string): CommentWithAuthor[] {
    const rows = this.database
      .prepare(
        `WITH RECURSIVE tenuti(id, parent_id) AS (
           SELECT id, parent_id FROM comments WHERE post_id = ? AND deleted_at IS NULL
           UNION
           SELECT antenato.id, antenato.parent_id
             FROM comments antenato
             JOIN tenuti t ON antenato.id = t.parent_id
         )
         SELECT c.id, c.post_id, c.parent_id, c.author_id, c.body, c.created_at, c.edited_at,
                c.deleted_at, c.hidden_at, u.username, u.display_name,
                (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) AS like_count,
                EXISTS (SELECT 1 FROM comment_likes k WHERE k.comment_id = c.id AND k.user_id = ?)
                  AS liked
         FROM comments c
         JOIN users u ON u.id = c.author_id
         JOIN tenuti ON tenuti.id = c.id
         ORDER BY c.created_at`,
      )
      .all(postId, callerId) as CommentRow[];

    return rows.map(toComment);
  }

  public update(id: string, body: string, editedAt: string): void {
    this.database
      .prepare("UPDATE comments SET body = ?, edited_at = ? WHERE id = ?")
      .run(body, editedAt, id);
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

export class SqliteCommentLikeRepository implements CommentLikeRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public add(commentId: string, userId: string, createdAt: string): void {
    this.database
      .prepare(
        "INSERT OR IGNORE INTO comment_likes (comment_id, user_id, created_at) VALUES (?, ?, ?)",
      )
      .run(commentId, userId, createdAt);
  }

  public remove(commentId: string, userId: string): void {
    this.database
      .prepare("DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?")
      .run(commentId, userId);
  }

  public count(commentId: string): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS total FROM comment_likes WHERE comment_id = ?")
      .get(commentId) as { total: number };

    return Number(row.total);
  }

  public has(commentId: string, userId: string): boolean {
    return (
      this.database
        .prepare("SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?")
        .get(commentId, userId) !== undefined
    );
  }
}
