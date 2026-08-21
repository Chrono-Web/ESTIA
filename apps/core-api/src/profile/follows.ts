import { createHash, randomBytes, randomUUID } from "node:crypto";
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

/** Quanto è lunga una prova. Trentadue byte: non si indovina, e si scrive in una riga. */
const GRANT_BYTES = 32;

/** Conia una prova per una coppia ([ADR 0023] §2). */
export function coniaProva(): string {
  return randomBytes(GRANT_BYTES).toString("base64url");
}

/**
 * L'impronta con cui si conserva una prova da chi la verifica.
 *
 * SHA-256 e non Argon2id, ed è deliberato: qui non c'è niente da indovinare —
 * il segreto ha 256 bit di casualità, non è una password scelta da una persona
 * — e la verifica sta sul percorso di lettura di ogni pagina di feed. È la
 * stessa scelta, per la stessa ragione, dei token di sessione di M1.2.
 */
export function improntaProva(prova: string): string {
  return createHash("sha256").update(prova).digest("hex");
}

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
  /**
   * L'hash della prova consegnata a chi segue ([ADR 0023] §2), o `null`.
   *
   * Solo l'hash: questa è la metà che **verifica**, e leggere il suo database
   * non deve produrre una credenziale utilizzabile. Sparisce con la riga,
   * ed è ciò che rende la revoca vera anche per la lettura.
   */
  grantHash: string | null;
}

export interface FollowingRecord {
  id: string;
  userId: string;
  targetInstance: string;
  targetUsername: string;
  state: FollowState;
  createdAt: string;
  /**
   * La prova, in chiaro, perché questa è la metà che la **presenta**.
   *
   * `null` finché l'altra istanza non l'ha consegnata: un follow accettato
   * prima che esistessero le prove, o una risposta mai arrivata. Si riottiene
   * richiedendo `segui`.
   */
  grant: string | null;
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
  /** Conia: registra l'hash della prova appena consegnata, sostituendo la precedente. */
  setFollowerGrant(id: string, hash: string): void;
  /**
   * Di chi è questa prova.
   *
   * L'istanza fa parte della chiave di ricerca e viene dalla connessione
   * autenticata: una prova rubata a un'altra istanza non vale qui.
   */
  findFollowerByGrant(instance: string, hash: string): FollowerRecord | undefined;

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
  setFollowingGrant(id: string, grant: string): void;
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
  grant_hash: string | null;
};

type FollowingRow = {
  id: string;
  user_id: string;
  target_instance: string;
  target_username: string;
  state: string;
  created_at: string;
  grant_secret: string | null;
};

function toFollower(row: FollowerRow): FollowerRecord {
  return {
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    followerInstance: row.follower_instance,
    followerUsername: row.follower_username,
    grantHash: row.grant_hash,
    id: row.id,
    state: row.state as FollowState,
    userId: row.user_id,
  };
}

function toFollowing(row: FollowingRow): FollowingRecord {
  return {
    createdAt: row.created_at,
    grant: row.grant_secret,
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

  public setFollowerGrant(id: string, hash: string): void {
    this.database.prepare("UPDATE followers SET grant_hash = ? WHERE id = ?").run(hash, id);
  }

  public findFollowerByGrant(instance: string, hash: string): FollowerRecord | undefined {
    const row = this.database
      .prepare("SELECT * FROM followers WHERE follower_instance = ? AND grant_hash = ?")
      .get(instance, hash) as FollowerRow | undefined;

    return row === undefined ? undefined : toFollower(row);
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

  public setFollowingGrant(id: string, grant: string): void {
    this.database.prepare("UPDATE following SET grant_secret = ? WHERE id = ?").run(grant, id);
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
