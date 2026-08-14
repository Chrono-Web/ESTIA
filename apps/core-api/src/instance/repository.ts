import type { DatabaseSync } from "node:sqlite";

export interface InstanceRecord {
  /** Opaque identifier. Never derived from the name or from any address. */
  id: string;
  name: string;
  description: string;
  publicKey: string;
  /** ISO-8601, UTC. */
  createdAt: string;
}

/**
 * Persistence port for the instance. The domain depends on this interface, not
 * on SQLite, so the storage engine stays replaceable (ARCHITECTURE §4).
 */
export interface InstanceRepository {
  find(): InstanceRecord | undefined;
  create(record: InstanceRecord): void;
}

interface InstanceRow {
  id: string;
  name: string;
  description: string;
  public_key: string;
  created_at: string;
}

export class SqliteInstanceRepository implements InstanceRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public find(): InstanceRecord | undefined {
    const row = this.database
      .prepare("SELECT id, name, description, public_key, created_at FROM instance LIMIT 1")
      .get() as InstanceRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      createdAt: row.created_at,
      description: row.description,
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
    };
  }

  public create(record: InstanceRecord): void {
    this.database
      .prepare(
        `INSERT INTO instance (id, name, description, public_key, created_at, singleton)
         VALUES (?, ?, ?, ?, ?, 1)`,
      )
      .run(record.id, record.name, record.description, record.publicKey, record.createdAt);
  }
}
