import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * Chi segue chi, in due metà che non si sovrappongono ([ADR 0022]).
 *
 * - `followers` è la lista che **autorizza**, e sta in casa di chi è seguito.
 *   Per questo togliere un follower ha effetto immediato: non c'è nessuna
 *   revoca da spedire, e nessun destinatario libero di ignorarla.
 * - `following` è la lista che serve ad **andare a prendere**, e sta in casa di
 *   chi segue.
 *
 * Non sono la stessa riga scritta due volte, e il fatto che possano divergere
 * non è un difetto da riparare con una sincronizzazione: se l'altra parte ha
 * tolto il follower, la lettura successiva fallisce, ed è così che lo si scopre.
 */

export type FollowState = "in_attesa" | "accettato";

export interface FollowerRecord {
  id: string;
  userId: string;
  /** La chiave dell'istanza da cui dice di venire. Autenticata dall'handshake. */
  followerInstance: string;
  /** Il nome dentro quell'istanza. **Dichiarato da lei**, mai verificato (ADR 0022 §4). */
  followerUsername: string;
  state: FollowState;
  createdAt: string;
  decidedAt: string | null;
}

export interface FollowingRecord {
  id: string;
  userId: string;
  targetInstance: string;
  targetUsername: string;
  state: FollowState;
  createdAt: string;
}

export interface FollowRepository {
  /** Chi mi segue. */
  listFollowers(userId: string): FollowerRecord[];
  findFollower(input: {
    userId: string;
    instance: string;
    username: string;
  }): FollowerRecord | undefined;
  addFollower(input: {
    userId: string;
    instance: string;
    username: string;
    state: FollowState;
    at: string;
  }): FollowerRecord;
  decideFollower(id: string, state: FollowState, at: string): void;
  removeFollower(id: string): boolean;

  /** Chi seguo. */
  listFollowing(userId: string): FollowingRecord[];
  findFollowing(input: {
    userId: string;
    instance: string;
    username: string;
  }): FollowingRecord | undefined;
  addFollowing(input: {
    userId: string;
    instance: string;
    username: string;
    state: FollowState;
    at: string;
  }): FollowingRecord;
  setFollowingState(id: string, state: FollowState): void;
  removeFollowing(id: string): boolean;

  /**
   * Se esiste un follow **accettato** con quell'istanza, in una direzione o
   * nell'altra. È ciò che fa la differenza fra «sconosciuta» e «in contatto»,
   * e nient'altro: non promuove a «collegata» (ADR 0022 §1).
   */
  hasAcceptedWith(instanceKey: string): boolean;
}

type FollowerRow = {
  id: string;
  user_id: string;
  follower_instance: string;
  follower_username: string;
  state: string;
  created_at: string;
  decided_at: string | null;
};

type FollowingRow = {
  id: string;
  user_id: string;
  target_instance: string;
  target_username: string;
  state: string;
  created_at: string;
};

function toFollower(row: FollowerRow): FollowerRecord {
  return {
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    followerInstance: row.follower_instance,
    followerUsername: row.follower_username,
    id: row.id,
    state: row.state as FollowState,
    userId: row.user_id,
  };
}

function toFollowing(row: FollowingRow): FollowingRecord {
  return {
    createdAt: row.created_at,
    id: row.id,
    state: row.state as FollowState,
    targetInstance: row.target_instance,
    targetUsername: row.target_username,
    userId: row.user_id,
  };
}

export class SqliteFollowRepository implements FollowRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public listFollowers(userId: string): FollowerRecord[] {
    return (
      this.database
        .prepare("SELECT * FROM followers WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId) as FollowerRow[]
    ).map(toFollower);
  }

  public findFollower(input: {
    userId: string;
    instance: string;
    username: string;
  }): FollowerRecord | undefined {
    const row = this.database
      .prepare(
        "SELECT * FROM followers WHERE user_id = ? AND follower_instance = ? AND follower_username = ?",
      )
      .get(input.userId, input.instance, input.username) as FollowerRow | undefined;

    return row === undefined ? undefined : toFollower(row);
  }

  public addFollower(input: {
    userId: string;
    instance: string;
    username: string;
    state: FollowState;
    at: string;
  }): FollowerRecord {
    const existing = this.findFollower(input);

    if (existing !== undefined) {
      return existing;
    }

    this.database
      .prepare(
        `INSERT INTO followers (id, user_id, follower_instance, follower_username, state, created_at, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.userId,
        input.instance,
        input.username,
        input.state,
        input.at,
        input.state === "accettato" ? input.at : null,
      );

    const saved = this.findFollower(input);

    if (saved === undefined) {
      throw new Error("The follower disappeared while being written.");
    }

    return saved;
  }

  public decideFollower(id: string, state: FollowState, at: string): void {
    this.database
      .prepare("UPDATE followers SET state = ?, decided_at = ? WHERE id = ?")
      .run(state, at, id);
  }

  public removeFollower(id: string): boolean {
    return Number(this.database.prepare("DELETE FROM followers WHERE id = ?").run(id).changes) > 0;
  }

  public listFollowing(userId: string): FollowingRecord[] {
    return (
      this.database
        .prepare("SELECT * FROM following WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId) as FollowingRow[]
    ).map(toFollowing);
  }

  public findFollowing(input: {
    userId: string;
    instance: string;
    username: string;
  }): FollowingRecord | undefined {
    const row = this.database
      .prepare(
        "SELECT * FROM following WHERE user_id = ? AND target_instance = ? AND target_username = ?",
      )
      .get(input.userId, input.instance, input.username) as FollowingRow | undefined;

    return row === undefined ? undefined : toFollowing(row);
  }

  public addFollowing(input: {
    userId: string;
    instance: string;
    username: string;
    state: FollowState;
    at: string;
  }): FollowingRecord {
    const existing = this.findFollowing(input);

    if (existing !== undefined) {
      return existing;
    }

    this.database
      .prepare(
        `INSERT INTO following (id, user_id, target_instance, target_username, state, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), input.userId, input.instance, input.username, input.state, input.at);

    const saved = this.findFollowing(input);

    if (saved === undefined) {
      throw new Error("The follow disappeared while being written.");
    }

    return saved;
  }

  public setFollowingState(id: string, state: FollowState): void {
    this.database.prepare("UPDATE following SET state = ? WHERE id = ?").run(state, id);
  }

  public removeFollowing(id: string): boolean {
    return Number(this.database.prepare("DELETE FROM following WHERE id = ?").run(id).changes) > 0;
  }

  public hasAcceptedWith(instanceKey: string): boolean {
    const row = this.database
      .prepare(
        `SELECT 1 AS trovato FROM followers WHERE follower_instance = ? AND state = 'accettato'
         UNION ALL
         SELECT 1 AS trovato FROM following WHERE target_instance = ? AND state = 'accettato'
         LIMIT 1`,
      )
      .get(instanceKey, instanceKey) as { trovato: number } | undefined;

    return row !== undefined;
  }
}
