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
  {
    version: 6,
    name: "media",
    statements: [
      // An image exists before the post that will carry it: it is uploaded,
      // validated and only then attached, which is what makes the write atomic
      // from the reader's point of view (ARCHITECTURE §5). Until `post_id` is
      // set the row is an orphan, and the sweep knows it by that.
      //
      // Sizes and dimensions are recorded because the quota is computed from
      // the database, never by walking the filesystem: the answer has to be the
      // same whatever the storage adapter underneath.
      //
      // No scope column: an image is visible exactly where its post is, and
      // duplicating the scope would create two truths that can disagree.
      `CREATE TABLE media (
         id TEXT PRIMARY KEY NOT NULL,
         owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         post_id TEXT REFERENCES posts (id) ON DELETE CASCADE,
         position INTEGER NOT NULL DEFAULT 0,
         format TEXT NOT NULL CHECK (format IN ('jpeg', 'png', 'webp')),
         byte_size INTEGER NOT NULL CHECK (byte_size > 0),
         width INTEGER NOT NULL CHECK (width > 0),
         height INTEGER NOT NULL CHECK (height > 0),
         thumb_byte_size INTEGER NOT NULL CHECK (thumb_byte_size > 0),
         thumb_width INTEGER NOT NULL CHECK (thumb_width > 0),
         thumb_height INTEGER NOT NULL CHECK (thumb_height > 0),
         alt_text TEXT NOT NULL DEFAULT '',
         created_at TEXT NOT NULL,
         attached_at TEXT,
         deleted_at TEXT
       ) STRICT`,
      `CREATE INDEX media_post ON media (post_id, position)`,
      `CREATE INDEX media_owner ON media (owner_id, deleted_at)`,
      `CREATE INDEX media_orphans ON media (created_at) WHERE post_id IS NULL AND deleted_at IS NULL`,
    ],
  },
  {
    version: 7,
    name: "schema-upgrades",
    statements: [
      // What happened the last time this schema moved forward, and above all
      // whether a backup preceded it (ADR 0014, punto 5).
      //
      // It is written down rather than only logged because the fact it records
      // stays true: migrations are forward-only, so an upgrade applied without a
      // backup has no point of return today, tomorrow, and after any number of
      // restarts. An advisory that expired on its own would be a lie with a
      // timer on it.
      `CREATE TABLE schema_upgrades (
         id TEXT PRIMARY KEY NOT NULL,
         from_version INTEGER NOT NULL,
         to_version INTEGER NOT NULL,
         migration_count INTEGER NOT NULL CHECK (migration_count > 0),
         applied_at TEXT NOT NULL,
         backup_status TEXT NOT NULL CHECK (backup_status IN ('created', 'not_configured', 'failed')),
         backup_name TEXT,
         detail TEXT NOT NULL DEFAULT ''
       ) STRICT`,
      `CREATE INDEX schema_upgrades_applied_at ON schema_upgrades (applied_at DESC)`,
    ],
  },
  {
    version: 8,
    name: "settings",
    statements: [
      // Configuration an administrator can change from the panel, without a
      // terminal and without restarting (ADR 0016).
      //
      // Deliberately not everything: port, data directory and limits stay
      // validated at startup, where a wrong value must stop the process. What
      // lives here is what forced the terminal open — the backup settings —
      // and the environment still wins over it, so an instance that already
      // works from `docker-compose.yml` keeps working the same way.
      //
      // Never holds the backup private key, nor any other secret: an instance
      // that could read its own archives is the one property ADR 0013 exists
      // to prevent.
      `CREATE TABLE settings (
         key TEXT PRIMARY KEY NOT NULL,
         value TEXT NOT NULL,
         updated_at TEXT NOT NULL
       ) STRICT`,
    ],
  },
  {
    version: 9,
    name: "remote-instances",
    statements: [
      // The instances this one has a relationship with (ADR 0020 §3).
      //
      // Only relationships live here. An instance that merely knocked leaves
      // nothing on disk: the counters that bound it are in memory and a restart
      // forgets them, because a list of everyone who tried to reach you is a
      // social graph of people who are not yours.
      //
      // `public_key` is unique but is never the identity a row is referenced
      // by — same rule as `username` in version 2 (ADR 0002). The key cannot be
      // renamed, but the rule is about how rows are joined, not about renaming.
      `CREATE TABLE remote_instances (
         id TEXT PRIMARY KEY NOT NULL,
         public_key TEXT NOT NULL,
         declared_name TEXT NOT NULL DEFAULT '',
         state TEXT NOT NULL CHECK (state IN ('richiesta_inviata', 'richiesta_ricevuta', 'collegata', 'bloccata')),
         created_at TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         last_seen_at TEXT,
         last_reached_via TEXT CHECK (last_reached_via IN ('diretto', 'relay'))
       ) STRICT`,
      `CREATE UNIQUE INDEX remote_instances_key_unique ON remote_instances (public_key)`,
    ],
  },
  {
    version: 10,
    name: "profiles",
    statements: [
      // The person's face outside the instance (ADR 0018 §«La presenza è una
      // scelta della persona»).
      //
      // `presence` defaults to `non_presente` in the schema as well as in the
      // domain, for the same reason `scope` defaults to `local`: nothing
      // becomes visible outside by omission. A member who never opens this
      // screen exists only inside their instance, and an upgrade that added
      // profiles must not have published anybody.
      //
      // There is deliberately **no table for other instances' profiles**. ADR
      // 0018 carried one until 2026-08-20 and it was removed: an index row is a
      // small copy that outlives the person it names, and it buys latency
      // rather than reach. Searches are forwarded and their answers are not
      // kept.
      `CREATE TABLE profiles (
         user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         bio TEXT NOT NULL DEFAULT '',
         presence TEXT NOT NULL DEFAULT 'non_presente' CHECK (presence IN ('non_presente', 'presente_privato', 'presente_pubblico')),
         updated_at TEXT NOT NULL
       ) STRICT`,
      // Only the public ones are ever listed, so that is the index worth having.
      `CREATE INDEX profiles_public ON profiles (presence) WHERE presence = 'presente_pubblico'`,
    ],
  },
  {
    version: 11,
    name: "follows",
    statements: [
      // Chi segue chi, e le due metà stanno in due posti diversi (ADR 0022).
      //
      // Non è la stessa riga scritta due volte: sono due fatti che servono a
      // due cose. `followers` è ciò che **autorizza** — l'istanza di chi è
      // seguito decide chi può leggere, quindi la lista che conta sta qui, e
      // togliere un follower ha effetto immediato senza spedire niente a
      // nessuno. `following` è ciò che serve ad **andare a prendere**: l'istanza
      // di chi segue deve sapere a chi bussare per comporre un feed.
      //
      // Da cui: nessuno stato condiviso da riconciliare fra due macchine che si
      // vedono a intermittenza. Ognuna conserva il fatto che le serve.
      `CREATE TABLE followers (
         id TEXT PRIMARY KEY NOT NULL,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         follower_instance TEXT NOT NULL,
         follower_username TEXT NOT NULL,
         state TEXT NOT NULL CHECK (state IN ('in_attesa', 'accettato')),
         created_at TEXT NOT NULL,
         decided_at TEXT
       ) STRICT`,
      `CREATE UNIQUE INDEX followers_unique ON followers (user_id, follower_instance, follower_username)`,
      `CREATE TABLE following (
         id TEXT PRIMARY KEY NOT NULL,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         target_instance TEXT NOT NULL,
         target_username TEXT NOT NULL,
         state TEXT NOT NULL CHECK (state IN ('in_attesa', 'accettato')),
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE UNIQUE INDEX following_unique ON following (user_id, target_instance, target_username)`,
      // Aperto o chiuso è distinto dalla presenza, e le due non vanno fuse: la
      // presenza dice se ti si trova, questo dice che cosa succede quando chi
      // ti ha trovato preme il pulsante. Default `0`, cioè chiuso.
      `ALTER TABLE profiles ADD COLUMN open_follows INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    version: 12,
    name: "comment-actions",
    statements: [
      // Like, risposta e modifica sui commenti: stessa forma dei post, senza
      // inventare un secondo modello. `parentId` è il commento immediato a cui
      // si risponde — l'albero è ricorsivo (ogni risposta è un commento pieno).
      `ALTER TABLE comments ADD COLUMN edited_at TEXT`,
      `ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments (id) ON DELETE CASCADE`,
      `CREATE INDEX comments_parent ON comments (parent_id)`,
      `CREATE TABLE comment_likes (
         comment_id TEXT NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         created_at TEXT NOT NULL,
         PRIMARY KEY (comment_id, user_id)
       ) STRICT`,
    ],
  },
];
