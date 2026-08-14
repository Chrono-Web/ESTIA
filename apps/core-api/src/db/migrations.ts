/**
 * Forward-only, versioned migrations.
 *
 * Rules that hold for every migration added here, from ADR 0002:
 * - primary keys are opaque identifiers, never derived from a username or a domain;
 * - timestamps are ISO-8601 strings in UTC;
 * - content tables carry an explicit scope defaulting to `local`;
 * - deletions that federation will need to announce are soft.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "instance",
    statements: [
      // `singleton` is pinned to 1 and unique, so the table can hold at most one row.
      `CREATE TABLE instance (
         id TEXT PRIMARY KEY NOT NULL,
         name TEXT NOT NULL,
         description TEXT NOT NULL DEFAULT '',
         public_key TEXT NOT NULL,
         created_at TEXT NOT NULL,
         singleton INTEGER NOT NULL DEFAULT 1 CHECK (singleton = 1) UNIQUE
       ) STRICT`,
    ],
  },
  {
    version: 2,
    name: "accounts-and-sessions",
    statements: [
      // `username` is unique but is never an identity: rows are referenced by
      // `id` only, so a rename never breaks a relationship (ADR 0002).
      `CREATE TABLE users (
         id TEXT PRIMARY KEY NOT NULL,
         username TEXT NOT NULL,
         display_name TEXT NOT NULL,
         password_hash TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('instance_admin', 'instance_moderator', 'member')),
         created_at TEXT NOT NULL,
         deleted_at TEXT
       ) STRICT`,
      // Stored lower-cased, so `Marco` cannot coexist with `marco`.
      `CREATE UNIQUE INDEX users_username_unique ON users (username)`,
      // Only the hash of a session token is stored: reading the database must
      // not yield a usable credential (SECURITY_BASELINE §3).
      `CREATE TABLE sessions (
         id TEXT PRIMARY KEY NOT NULL,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         token_hash TEXT NOT NULL,
         device_label TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL,
         last_seen_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         revoked_at TEXT
       ) STRICT`,
      `CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash)`,
      `CREATE INDEX sessions_user_id ON sessions (user_id)`,
    ],
  },
  {
    version: 3,
    name: "recovery-codes",
    statements: [
      // Only the hash is kept: the code itself exists on paper, in a password
      // manager, on a USB key — wherever the administrator decided (ADR 0009).
      `CREATE TABLE recovery_codes (
         id TEXT PRIMARY KEY NOT NULL,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         code_hash TEXT NOT NULL,
         created_at TEXT NOT NULL,
         used_at TEXT
       ) STRICT`,
      // At most one usable code per account; spent ones stay for the audit trail.
      `CREATE UNIQUE INDEX recovery_codes_active ON recovery_codes (user_id) WHERE used_at IS NULL`,
      `CREATE INDEX recovery_codes_code_hash ON recovery_codes (code_hash)`,
    ],
  },
  {
    version: 4,
    name: "admission",
    statements: [
      // Only the hash: an invite code is a credential like any other
      // (SECURITY_BASELINE §3).
      `CREATE TABLE invites (
         id TEXT PRIMARY KEY NOT NULL,
         code_hash TEXT NOT NULL,
         label TEXT NOT NULL DEFAULT '',
         created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         max_uses INTEGER NOT NULL CHECK (max_uses >= 1),
         used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
         created_at TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         revoked_at TEXT
       ) STRICT`,
      `CREATE UNIQUE INDEX invites_code_hash ON invites (code_hash)`,
      // A valid invite lets someone ask; it never admits them on its own.
      // Approval is a separate, explicit act (ADR 0003, requisito 3).
      `CREATE TABLE join_requests (
         id TEXT PRIMARY KEY NOT NULL,
         invite_id TEXT NOT NULL REFERENCES invites (id) ON DELETE CASCADE,
         username TEXT NOT NULL,
         display_name TEXT NOT NULL,
         password_hash TEXT NOT NULL,
         message TEXT NOT NULL DEFAULT '',
         status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
         created_at TEXT NOT NULL,
         decided_at TEXT,
         decided_by TEXT REFERENCES users (id) ON DELETE SET NULL,
         created_user_id TEXT REFERENCES users (id) ON DELETE SET NULL
       ) STRICT`,
      `CREATE INDEX join_requests_status ON join_requests (status, created_at)`,
      // Administrative acts are recorded so that they can be reviewed later.
      // Never holds credential material, only what happened and to whom.
      `CREATE TABLE audit_events (
         id TEXT PRIMARY KEY NOT NULL,
         actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
         action TEXT NOT NULL,
         subject TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE INDEX audit_events_created_at ON audit_events (created_at)`,
    ],
  },
  {
    version: 5,
    name: "feed",
    statements: [
      // `scope` defaults to 'local' in the schema as well as in the domain:
      // a content that reaches the database without one is a neighbourhood
      // post, never a public one (PROJECT_SPEC §6, ADR 0002).
      `CREATE TABLE posts (
         id TEXT PRIMARY KEY NOT NULL,
         author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         body TEXT NOT NULL,
         scope TEXT NOT NULL DEFAULT 'local' CHECK (scope IN ('local', 'followers', 'public')),
         created_at TEXT NOT NULL,
         edited_at TEXT,
         deleted_at TEXT,
         hidden_at TEXT,
         hidden_by TEXT REFERENCES users (id) ON DELETE SET NULL
       ) STRICT`,
      // Chronological, no ranking: the order is the index (PRODUCT_VISION §3).
      `CREATE INDEX posts_timeline ON posts (created_at DESC, id DESC)`,
      `CREATE TABLE comments (
         id TEXT PRIMARY KEY NOT NULL,
         post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
         author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         body TEXT NOT NULL,
         created_at TEXT NOT NULL,
         deleted_at TEXT,
         hidden_at TEXT,
         hidden_by TEXT REFERENCES users (id) ON DELETE SET NULL
       ) STRICT`,
      `CREATE INDEX comments_post ON comments (post_id, created_at)`,
      // One like per person per post, enforced by the key itself.
      `CREATE TABLE post_likes (
         post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         created_at TEXT NOT NULL,
         PRIMARY KEY (post_id, user_id)
       ) STRICT`,
    ],
  },
];
