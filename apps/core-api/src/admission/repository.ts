import type { DatabaseSync } from "node:sqlite";

import type { JoinRequestStatus } from "@estia/contracts";

export interface InviteRecord {
  id: string;
  codeHash: string;
  label: string;
  createdBy: string;
  maxUses: number;
  usedCount: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface JoinRequestRecord {
  id: string;
  inviteId: string;
  username: string;
  displayName: string;
  passwordHash: string;
  message: string;
  status: JoinRequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  createdUserId: string | null;
}

export interface AuditEventRecord {
  id: string;
  actorUserId: string | null;
  action: string;
  subject: string;
  createdAt: string;
}

export interface InviteRepository {
  create(record: InviteRecord): void;
  findByCodeHash(codeHash: string): InviteRecord | undefined;
  findById(id: string): InviteRecord | undefined;
  list(): InviteRecord[];
  consumeOne(id: string): void;
  revoke(id: string, revokedAt: string): boolean;
}

export interface JoinRequestRepository {
  create(record: JoinRequestRecord): void;
  findById(id: string): JoinRequestRecord | undefined;
  findPendingByUsername(username: string): JoinRequestRecord | undefined;
  listByStatus(status: JoinRequestStatus): JoinRequestRecord[];
  decide(input: {
    id: string;
    status: JoinRequestStatus;
    decidedAt: string;
    decidedBy: string;
    createdUserId: string | null;
  }): void;
}

export interface AuditRepository {
  record(event: AuditEventRecord): void;
  listRecent(limit: number): (AuditEventRecord & { actorUsername: string | null })[];
}

type InviteRow = {
  id: string;
  code_hash: string;
  label: string;
  created_by: string;
  max_uses: number;
  used_count: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type JoinRequestRow = {
  id: string;
  invite_id: string;
  username: string;
  display_name: string;
  password_hash: string;
  message: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  created_user_id: string | null;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  subject: string;
  created_at: string;
  actor_username: string | null;
};

const INVITE_COLUMNS =
  "id, code_hash, label, created_by, max_uses, used_count, created_at, expires_at, revoked_at";
const REQUEST_COLUMNS =
  "id, invite_id, username, display_name, password_hash, message, status, created_at, decided_at, decided_by, created_user_id";

function toInvite(row: InviteRow): InviteRecord {
  return {
    codeHash: row.code_hash,
    createdAt: row.created_at,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    id: row.id,
    label: row.label,
    maxUses: Number(row.max_uses),
    revokedAt: row.revoked_at,
    usedCount: Number(row.used_count),
  };
}

function toRequest(row: JoinRequestRow): JoinRequestRecord {
  return {
    createdAt: row.created_at,
    createdUserId: row.created_user_id,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    displayName: row.display_name,
    id: row.id,
    inviteId: row.invite_id,
    message: row.message,
    passwordHash: row.password_hash,
    status: row.status as JoinRequestStatus,
    username: row.username,
  };
}

export class SqliteInviteRepository implements InviteRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: InviteRecord): void {
    this.database
      .prepare(`INSERT INTO invites (${INVITE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        record.id,
        record.codeHash,
        record.label,
        record.createdBy,
        record.maxUses,
        record.usedCount,
        record.createdAt,
        record.expiresAt,
        record.revokedAt,
      );
  }

  public findByCodeHash(codeHash: string): InviteRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${INVITE_COLUMNS} FROM invites WHERE code_hash = ?`)
      .get(codeHash) as InviteRow | undefined;

    return row === undefined ? undefined : toInvite(row);
  }

  public findById(id: string): InviteRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${INVITE_COLUMNS} FROM invites WHERE id = ?`)
      .get(id) as InviteRow | undefined;

    return row === undefined ? undefined : toInvite(row);
  }

  public list(): InviteRecord[] {
    return (
      this.database
        .prepare(`SELECT ${INVITE_COLUMNS} FROM invites ORDER BY created_at DESC`)
        .all() as InviteRow[]
    ).map(toInvite);
  }

  public consumeOne(id: string): void {
    this.database.prepare("UPDATE invites SET used_count = used_count + 1 WHERE id = ?").run(id);
  }

  public revoke(id: string, revokedAt: string): boolean {
    const result = this.database
      .prepare("UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(revokedAt, id);

    return Number(result.changes) > 0;
  }
}

export class SqliteJoinRequestRepository implements JoinRequestRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: JoinRequestRecord): void {
    this.database
      .prepare(
        `INSERT INTO join_requests (${REQUEST_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.inviteId,
        record.username,
        record.displayName,
        record.passwordHash,
        record.message,
        record.status,
        record.createdAt,
        record.decidedAt,
        record.decidedBy,
        record.createdUserId,
      );
  }

  public findById(id: string): JoinRequestRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${REQUEST_COLUMNS} FROM join_requests WHERE id = ?`)
      .get(id) as JoinRequestRow | undefined;

    return row === undefined ? undefined : toRequest(row);
  }

  public findPendingByUsername(username: string): JoinRequestRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT ${REQUEST_COLUMNS} FROM join_requests WHERE username = ? AND status = 'pending'`,
      )
      .get(username) as JoinRequestRow | undefined;

    return row === undefined ? undefined : toRequest(row);
  }

  public listByStatus(status: JoinRequestStatus): JoinRequestRecord[] {
    return (
      this.database
        .prepare(
          `SELECT ${REQUEST_COLUMNS} FROM join_requests WHERE status = ? ORDER BY created_at`,
        )
        .all(status) as JoinRequestRow[]
    ).map(toRequest);
  }

  public decide(input: {
    id: string;
    status: JoinRequestStatus;
    decidedAt: string;
    decidedBy: string;
    createdUserId: string | null;
  }): void {
    this.database
      .prepare(
        `UPDATE join_requests
         SET status = ?, decided_at = ?, decided_by = ?, created_user_id = ?
         WHERE id = ?`,
      )
      .run(input.status, input.decidedAt, input.decidedBy, input.createdUserId, input.id);
  }
}

export class SqliteAuditRepository implements AuditRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public record(event: AuditEventRecord): void {
    this.database
      .prepare(
        "INSERT INTO audit_events (id, actor_user_id, action, subject, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(event.id, event.actorUserId, event.action, event.subject, event.createdAt);
  }

  public listRecent(limit: number): (AuditEventRecord & { actorUsername: string | null })[] {
    const rows = this.database
      .prepare(
        `SELECT e.id, e.actor_user_id, e.action, e.subject, e.created_at, u.username AS actor_username
         FROM audit_events e
         LEFT JOIN users u ON u.id = e.actor_user_id
         ORDER BY e.created_at DESC
         LIMIT ?`,
      )
      .all(limit) as AuditRow[];

    return rows.map((row) => ({
      action: row.action,
      actorUserId: row.actor_user_id,
      actorUsername: row.actor_username,
      createdAt: row.created_at,
      id: row.id,
      subject: row.subject,
    }));
  }
}
