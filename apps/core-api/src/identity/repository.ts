import type { DatabaseSync } from "node:sqlite";

import type { UserRole } from "@estia/contracts";

export interface UserRecord {
  /** Opaque identifier. Rows are referenced by this, never by username. */
  id: string;
  /** Lower-cased and unique within the instance. */
  username: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  deletedAt: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface RecoveryCodeRecord {
  id: string;
  userId: string;
  codeHash: string;
  createdAt: string;
  usedAt: string | null;
}

export interface UserRepository {
  create(record: UserRecord): void;
  findById(id: string): UserRecord | undefined;
  findByUsername(username: string): UserRecord | undefined;
  updateDisplayName(id: string, displayName: string): void;
  updatePasswordHash(id: string, passwordHash: string): void;
  countActive(): number;
}

export interface RecoveryCodeRepository {
  /** Replaces any code still usable: an account has at most one at a time. */
  replaceActive(record: RecoveryCodeRecord, replacedAt: string): void;
  findActiveForUser(userId: string): RecoveryCodeRecord | undefined;
  markUsed(id: string, usedAt: string): void;
}

export interface SessionRepository {
  create(record: SessionRecord): void;
  findByTokenHash(tokenHash: string): SessionRecord | undefined;
  /** Scoped by user on purpose: a caller must not reach another's session. */
  findForUser(userId: string, sessionId: string): SessionRecord | undefined;
  listForUser(userId: string): SessionRecord[];
  touch(id: string, seenAt: string): void;
  revoke(id: string, revokedAt: string): boolean;
  revokeAllForUser(userId: string, revokedAt: string): number;
}

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
  created_at: string;
  deleted_at: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

function toUser(row: UserRow): UserRecord {
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    displayName: row.display_name,
    id: row.id,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    username: row.username,
  };
}

function toSession(row: SessionRow): SessionRecord {
  return {
    createdAt: row.created_at,
    deviceLabel: row.device_label,
    expiresAt: row.expires_at,
    id: row.id,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    tokenHash: row.token_hash,
    userId: row.user_id,
  };
}

const USER_COLUMNS = "id, username, display_name, password_hash, role, created_at, deleted_at";
const SESSION_COLUMNS =
  "id, user_id, token_hash, device_label, created_at, last_seen_at, expires_at, revoked_at";

export class SqliteUserRepository implements UserRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: UserRecord): void {
    this.database
      .prepare(
        `INSERT INTO users (${USER_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.username,
        record.displayName,
        record.passwordHash,
        record.role,
        record.createdAt,
        record.deletedAt,
      );
  }

  public findById(id: string): UserRecord | undefined {
    const row = this.database.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as
      UserRow | undefined;

    return row === undefined ? undefined : toUser(row);
  }

  public findByUsername(username: string): UserRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
      .get(username) as UserRow | undefined;

    return row === undefined ? undefined : toUser(row);
  }

  /** Il nome che si mostra. Lo `username` non si tocca: su di esso poggiano i follow. */
  public updateDisplayName(id: string, displayName: string): void {
    this.database.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, id);
  }

  public updatePasswordHash(id: string, passwordHash: string): void {
    this.database.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
  }

  public countActive(): number {
    const row = this.database
      .prepare("SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL")
      .get() as { total: number };

    return Number(row.total);
  }
}

type RecoveryCodeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  created_at: string;
  used_at: string | null;
};

const RECOVERY_COLUMNS = "id, user_id, code_hash, created_at, used_at";

export class SqliteRecoveryCodeRepository implements RecoveryCodeRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public replaceActive(record: RecoveryCodeRecord, replacedAt: string): void {
    // Spending the old one first keeps the partial unique index satisfied and
    // leaves a trace that a code existed.
    this.database
      .prepare("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
      .run(replacedAt, record.userId);

    this.database
      .prepare(`INSERT INTO recovery_codes (${RECOVERY_COLUMNS}) VALUES (?, ?, ?, ?, ?)`)
      .run(record.id, record.userId, record.codeHash, record.createdAt, record.usedAt);
  }

  public findActiveForUser(userId: string): RecoveryCodeRecord | undefined {
    const row = this.database
      .prepare(
        `SELECT ${RECOVERY_COLUMNS} FROM recovery_codes WHERE user_id = ? AND used_at IS NULL`,
      )
      .get(userId) as RecoveryCodeRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      codeHash: row.code_hash,
      createdAt: row.created_at,
      id: row.id,
      userId: row.user_id,
      usedAt: row.used_at,
    };
  }

  public markUsed(id: string, usedAt: string): void {
    this.database.prepare("UPDATE recovery_codes SET used_at = ? WHERE id = ?").run(usedAt, id);
  }
}

export class SqliteSessionRepository implements SessionRepository {
  public constructor(private readonly database: DatabaseSync) {}

  public create(record: SessionRecord): void {
    this.database
      .prepare(
        `INSERT INTO sessions (${SESSION_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.userId,
        record.tokenHash,
        record.deviceLabel,
        record.createdAt,
        record.lastSeenAt,
        record.expiresAt,
        record.revokedAt,
      );
  }

  public findByTokenHash(tokenHash: string): SessionRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE token_hash = ?`)
      .get(tokenHash) as SessionRow | undefined;

    return row === undefined ? undefined : toSession(row);
  }

  public findForUser(userId: string, sessionId: string): SessionRecord | undefined {
    const row = this.database
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ? AND user_id = ?`)
      .get(sessionId, userId) as SessionRow | undefined;

    return row === undefined ? undefined : toSession(row);
  }

  public listForUser(userId: string): SessionRecord[] {
    const rows = this.database
      .prepare(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as SessionRow[];

    return rows.map(toSession);
  }

  public touch(id: string, seenAt: string): void {
    this.database.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(seenAt, id);
  }

  public revoke(id: string, revokedAt: string): boolean {
    const result = this.database
      .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .run(revokedAt, id);

    return Number(result.changes) > 0;
  }

  public revokeAllForUser(userId: string, revokedAt: string): number {
    const result = this.database
      .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
      .run(revokedAt, userId);

    return Number(result.changes);
  }
}
