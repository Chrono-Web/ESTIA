import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

/**
 * The instances this one has a relationship with, and only those.
 *
 * The line that decides what is written here is **consent**, not traffic
 * (ADR 0020 §3). A row exists because somebody on one side or the other made a
 * decision: asked, was asked, accepted, or refused. An instance that merely
 * opened a connection and said hello leaves nothing behind — its budget is
 * counted in memory and forgotten on restart.
 *
 * That asymmetry is the whole point. A table of everyone who ever knocked would
 * be, after a year, a map of who has had this instance's key in their hands —
 * a social graph of people who are not this instance's members.
 */

export type RemoteState = "richiesta_inviata" | "richiesta_ricevuta" | "collegata" | "bloccata";

export type ReachedVia = "diretto" | "relay";

export interface RemoteInstanceRecord {
  id: string;
  /** The other instance's ed25519 public key: fixed, and its address. */
  publicKey: string;
  /** What it calls itself. **Declared, never verified** — ADR 0020 §5. */
  declaredName: string;
  state: RemoteState;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  lastReachedVia: ReachedVia | null;
}

export interface RemoteInstanceRepository {
  findByKey(publicKey: string): RemoteInstanceRecord | undefined;
  list(): RemoteInstanceRecord[];
  upsertState(input: {
    publicKey: string;
    declaredName?: string;
    state: RemoteState;
    at: string;
  }): RemoteInstanceRecord;
  markSeen(input: { publicKey: string; at: string; via?: ReachedVia; declaredName?: string }): void;
  remove(publicKey: string): boolean;
}

type Row = {
  id: string;
  public_key: string;
  declared_name: string;
  state: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  last_reached_via: string | null;
};

const COLUMNS =
  "id, public_key, declared_name, state, created_at, updated_at, last_seen_at, last_reached_via";

function toRecord(row: Row): RemoteInstanceRecord {
  return {
    createdAt: row.created_at,
    declaredName: row.declared_name,
    id: row.id,
    lastReachedVia: row.last_reached_via as ReachedVia | null,
    lastSeenAt: row.last_seen_at,
    publicKey: row.public_key,
    state: row.state as RemoteState,
    updatedAt: row.updated_at,
  };
}

export class SqliteRemoteInstanceRepository implements RemoteInstanceRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public findByKey(publicKey: string): RemoteInstanceRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${COLUMNS} FROM remote_instances WHERE public_key = ?`)
      .get(publicKey) as Row | undefined;

    return row === undefined ? undefined : toRecord(row);
  }

  public list(): RemoteInstanceRecord[] {
    const rows = this.database
      .prepare(`SELECT ${COLUMNS} FROM remote_instances ORDER BY created_at ASC`)
      .all() as Row[];

    return rows.map(toRecord);
  }

  public upsertState(input: {
    publicKey: string;
    declaredName?: string;
    state: RemoteState;
    at: string;
  }): RemoteInstanceRecord {
    const existing = this.findByKey(input.publicKey);

    if (existing === undefined) {
      this.database
        .prepare(
          `INSERT INTO remote_instances (id, public_key, declared_name, state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          input.publicKey,
          input.declaredName ?? "",
          input.state,
          input.at,
          input.at,
        );
    } else {
      // A name is only replaced when a new one arrived: a call that carried no
      // name must not blank out the one the panel is showing.
      this.database
        .prepare(
          `UPDATE remote_instances
              SET state = ?, declared_name = COALESCE(?, declared_name), updated_at = ?
            WHERE public_key = ?`,
        )
        .run(input.state, input.declaredName ?? null, input.at, input.publicKey);
    }

    const saved = this.findByKey(input.publicKey);

    if (saved === undefined) {
      throw new Error("The remote instance disappeared while being written.");
    }

    return saved;
  }

  public markSeen(input: {
    publicKey: string;
    at: string;
    via?: ReachedVia;
    declaredName?: string;
  }): void {
    this.database
      .prepare(
        `UPDATE remote_instances
            SET last_seen_at = ?,
                last_reached_via = COALESCE(?, last_reached_via),
                declared_name = COALESCE(?, declared_name)
          WHERE public_key = ?`,
      )
      .run(input.at, input.via ?? null, input.declaredName ?? null, input.publicKey);
  }

  public remove(publicKey: string): boolean {
    const result = this.database
      .prepare("DELETE FROM remote_instances WHERE public_key = ?")
      .run(publicKey);

    return Number(result.changes) > 0;
  }
}
