import type { DatabaseSync } from "node:sqlite";

/**
 * The profiles of this instance's own members, and of nobody else.
 *
 * The absence is the design. Until 2026-08-20 [ADR 0018] had every instance
 * keeping the public profiles of the instances it was connected to; that index
 * was removed, because an index row is a small copy that outlives the person it
 * names — somebody who leaves the network keeps existing in twenty databases —
 * and because it bought latency, not reach: the instances an index would cover
 * are exactly the ones a forwarded search asks.
 *
 * So a search goes out and its answers are used and dropped. Nothing about a
 * person hosted elsewhere is ever written here.
 */

export type Presence = "non_presente" | "presente_privato" | "presente_pubblico";

export interface ProfileRecord {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  presence: Presence;
  /**
   * Se i follow entrano senza chiedere.
   *
   * Distinto dalla presenza, e non vanno fusi: la presenza dice **se e come ti
   * si trova**, questo dice **che cosa succede quando chi ti ha trovato preme
   * il pulsante**. Pubblico e chiuso è una combinazione sensata — sono
   * trovabile, e scelgo chi mi legge — e un interruttore solo la renderebbe
   * impossibile. Default chiuso (ADR 0022 §3).
   */
  openFollows: boolean;
  updatedAt: string;
  /** Da quando questa persona abita qui. È la data dell'account, non del profilo. */
  createdAt: string;
}

export interface ProfileRepository {
  find(userId: string): ProfileRecord | undefined;
  findByUsername(username: string): ProfileRecord | undefined;
  save(input: {
    userId: string;
    bio: string;
    presence: Presence;
    openFollows: boolean;
    updatedAt: string;
  }): void;
  /** Only the public ones, which are the only ones that may be listed to another instance. */
  listPublic(limit: number): ProfileRecord[];
  searchPublic(term: string, limit: number): ProfileRecord[];
  /**
   * Members of this instance, whatever their presence.
   *
   * Presence governs who exists **outside**; inside, the people who share an
   * instance can find each other, and a neighbour who never opened the network
   * screen has not thereby hidden from their own neighbours.
   */
  searchMembers(term: string, limit: number): ProfileRecord[];
}

type Row = {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  presence: string;
  open_follows: number;
  updated_at: string;
  created_at: string;
};

/**
 * A member without a row has never opened the screen, and the honest reading of
 * that is `non_presente` — the default that keeps somebody who decided nothing
 * out of the network entirely.
 */
const SELECT = `
  SELECT u.id AS user_id,
         u.username AS username,
         u.display_name AS display_name,
         COALESCE(p.bio, '') AS bio,
         COALESCE(p.presence, 'non_presente') AS presence,
         COALESCE(p.open_follows, 0) AS open_follows,
         COALESCE(p.updated_at, u.created_at) AS updated_at,
         u.created_at AS created_at
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
   WHERE u.deleted_at IS NULL`;

function toRecord(row: Row): ProfileRecord {
  return {
    bio: row.bio,
    createdAt: row.created_at,
    displayName: row.display_name,
    openFollows: row.open_follows === 1,
    presence: row.presence as Presence,
    updatedAt: row.updated_at,
    userId: row.user_id,
    username: row.username,
  };
}

export class SqliteProfileRepository implements ProfileRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public find(userId: string): ProfileRecord | undefined {
    const row = this.database.prepare(`${SELECT} AND u.id = ?`).get(userId) as Row | undefined;

    return row === undefined ? undefined : toRecord(row);
  }

  public findByUsername(username: string): ProfileRecord | undefined {
    const row = this.database
      .prepare(`${SELECT} AND u.username = ?`)
      .get(username.trim().toLowerCase()) as Row | undefined;

    return row === undefined ? undefined : toRecord(row);
  }

  public save(input: {
    userId: string;
    bio: string;
    presence: Presence;
    openFollows: boolean;
    updatedAt: string;
  }): void {
    this.database
      .prepare(
        `INSERT INTO profiles (user_id, bio, presence, open_follows, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET bio = excluded.bio,
                                             presence = excluded.presence,
                                             open_follows = excluded.open_follows,
                                             updated_at = excluded.updated_at`,
      )
      .run(input.userId, input.bio, input.presence, input.openFollows ? 1 : 0, input.updatedAt);
  }

  public listPublic(limit: number): ProfileRecord[] {
    const rows = this.database
      .prepare(`${SELECT} AND p.presence = 'presente_pubblico' ORDER BY u.username LIMIT ?`)
      .all(limit) as Row[];

    return rows.map(toRecord);
  }

  public searchMembers(term: string, limit: number): ProfileRecord[] {
    const like = `%${term.trim().toLowerCase()}%`;
    const rows = this.database
      .prepare(
        `${SELECT} AND (LOWER(u.username) LIKE ? OR LOWER(u.display_name) LIKE ?)
         ORDER BY u.username LIMIT ?`,
      )
      .all(like, like, limit) as Row[];

    return rows.map(toRecord);
  }

  public searchPublic(term: string, limit: number): ProfileRecord[] {
    // `presente_privato` is deliberately absent: not appearing in a search is
    // the whole of what that state promises (ADR 0018).
    const like = `%${term.trim().toLowerCase()}%`;
    const rows = this.database
      .prepare(
        `${SELECT} AND p.presence = 'presente_pubblico'
                   AND (LOWER(u.username) LIKE ? OR LOWER(u.display_name) LIKE ?)
         ORDER BY u.username LIMIT ?`,
      )
      .all(like, like, limit) as Row[];

    return rows.map(toRecord);
  }
}
