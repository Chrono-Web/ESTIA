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
  {
    version: 13,
    name: "prova-della-coppia",
    statements: [
      // Il segreto per coppia di [ADR 0023] §2, nelle due metà che ADR 0022
      // tiene in due case diverse — e le due colonne non sono la stessa cosa
      // scritta due volte.
      //
      // Chi **verifica** conserva solo l'hash: leggere questo database non deve
      // produrre una credenziale utilizzabile, che è la regola dei token di
      // sessione di M1.2. Chi **presenta** conserva il segreto in chiaro,
      // perché una credenziale che va presentata da qualche parte non può
      // essere un hash. L'asimmetria è la stessa di una password.
      //
      // Nullable per forza: i follow accettati prima di oggi non hanno una
      // prova, e non ne inventiamo una — si riconia richiedendo `segui`, che è
      // lo stesso gesto con cui si scopre di essere stati accettati.
      `ALTER TABLE followers ADD COLUMN grant_hash TEXT`,
      // Parziale: l'unica ricerca che serve è «questa prova, di chi è», e le
      // righe senza prova non hanno niente da farci dentro.
      `CREATE INDEX followers_grant ON followers (grant_hash) WHERE grant_hash IS NOT NULL`,
      `ALTER TABLE following ADD COLUMN grant_secret TEXT`,
    ],
  },
  {
    version: 14,
    name: "ui-preferences",
    statements: [
      // Come la persona vede ESTIA (ADR 0024): non è il profilo pubblico e non
      // è un tema dell'istanza. Catalogo chiuso — i CHECK sono il contratto.
      `CREATE TABLE ui_preferences (
         user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         aspetto TEXT NOT NULL DEFAULT 'sistema' CHECK (aspetto IN ('sistema', 'chiaro', 'scuro')),
         contrasto TEXT NOT NULL DEFAULT 'normale' CHECK (contrasto IN ('normale', 'alto')),
         palette TEXT NOT NULL DEFAULT 'terracotta' CHECK (palette IN ('terracotta', 'ambra-acqua', 'rosso-petrolio', 'neutro')),
         updated_at TEXT NOT NULL
       ) STRICT`,
    ],
  },
  {
    version: 15,
    name: "cuori-che-attraversano",
    statements: [
      // Un cuore messo da qualcunə di un'altra casa ([ADR 0025] §3).
      //
      // È la prima tabella che conserva un fatto prodotto altrove, e la
      // giustificazione è la stessa asimmetria di [ADR 0022]: chi è seguito
      // conserva i propri follower perché quella è la lista che autorizza e
      // che conta. Un cuore sul mio post è un fatto sul **mio** contenuto: se
      // stesse a casa di chi l'ha messo, il conteggio del mio post sarebbe una
      // domanda da girare a macchine che possono essere spente.
      //
      // **Il nome non è l'identità della riga**, ed è l'invariante di
      // [ADR 0002] che `followers` rispetta già allo stesso modo: `id` come
      // chiave, e l'unicità della coppia in un indice. Una chiave primaria che
      // contenga un nome renderebbe impossibile un cambio di nome, che è
      // precisamente ciò che quell'ADR tiene aperto.
      //
      // È l'indice unico, quindi, il motivo per cui premere due volte non
      // gonfia niente: una riga sola per (post, casa, nome). E `ON DELETE
      // CASCADE` è il motivo per cui non esiste nessuna pulizia da
      // ricordarsi — il cuore sparisce con il post, e con lui la notifica.
      //
      // Il nome è **dichiarato dall'altra istanza**, mai verificato (ADR 0020
      // §5). Con una prova per coppia dietro c'è comunque un sì detto da
      // qualcuno di qua; con la prova sentinella di un profilo pubblico no, e
      // ADR 0025 §2 scrive per esteso che cosa questo garantisce e che cosa no.
      `CREATE TABLE remote_post_likes (
         id TEXT PRIMARY KEY NOT NULL,
         post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
         instance_key TEXT NOT NULL,
         username TEXT NOT NULL,
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE UNIQUE INDEX remote_post_likes_unique
         ON remote_post_likes (post_id, instance_key, username)`,
      // Le notifiche si leggono in ordine di data attraverso sei sorgenti:
      // questo è l'indice che serve alla metà remota di quella lettura.
      `CREATE INDEX remote_post_likes_recenti ON remote_post_likes (created_at DESC)`,
      // Revocare un follower porta via i suoi cuori (ADR 0025 §3), e la
      // cancellazione cerca per casa e nome: l'indice è quello.
      `CREATE INDEX remote_post_likes_chi ON remote_post_likes (instance_key, username)`,
      // **L'unica cosa che si scrive per le notifiche**, perché è l'unica non
      // deducibile da nient'altro: fin dove questa persona ha già guardato
      // ([ADR 0025] §4). Non è una preferenza — quelle stanno in
      // `ui_preferences` con il catalogo chiuso di ADR 0024 — ed è un fatto
      // sul tempo, non sul gusto.
      `CREATE TABLE notifiche_viste (
         user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         viste_at TEXT NOT NULL
       ) STRICT`,
    ],
  },
  {
    version: 16,
    name: "attivita-per-lente",
    statements: [
      // Le due lenti valgono anche per l'attività ([ADR 0025] §4), e da questo
      // discende **un segno per lente e non uno solo**.
      //
      // Con un segno solo, aprire l'attività dell'istanza avrebbe spento in
      // silenzio le novità della rete: il segno è un istante, e un istante
      // copre tutto ciò che è più vecchio di lui in qualunque lente. Sarebbe
      // stato un modo di far sparire delle notizie senza che nessuno le abbia
      // viste, che è peggio del difetto che l'attività è nata per chiudere.
      //
      // Si ricostruisce invece di aggiungere una colonna perché cambia la
      // chiave primaria, e in SQLite una chiave primaria non si altera. Le
      // righe che c'erano valgono per l'istanza: è la lente predefinita, ed è
      // quella che quel segno stava misurando quando l'altra non esisteva.
      `ALTER TABLE notifiche_viste RENAME TO notifiche_viste_v1`,
      `CREATE TABLE notifiche_viste (
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         lente TEXT NOT NULL CHECK (lente IN ('istanza', 'rete')),
         viste_at TEXT NOT NULL,
         PRIMARY KEY (user_id, lente)
       ) STRICT`,
      `INSERT INTO notifiche_viste (user_id, lente, viste_at)
         SELECT user_id, 'istanza', viste_at FROM notifiche_viste_v1`,
      `DROP TABLE notifiche_viste_v1`,
    ],
  },
  {
    version: 17,
    name: "remote-comments",
    statements: [
      `CREATE TABLE remote_comments (
         id TEXT PRIMARY KEY NOT NULL,
         post_id TEXT NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
         instance_key TEXT NOT NULL,
         username TEXT NOT NULL,
         remote_comment_id TEXT NOT NULL,
         created_at TEXT NOT NULL,
         hidden_at TEXT,
         hidden_by TEXT REFERENCES users (id) ON DELETE SET NULL
       ) STRICT`,
      `CREATE UNIQUE INDEX remote_comments_unique
         ON remote_comments (post_id, instance_key, remote_comment_id)`,
      `CREATE INDEX remote_comments_recenti ON remote_comments (created_at DESC)`,
      `CREATE INDEX remote_comments_chi ON remote_comments (instance_key, username)`,
    ],
  },
  {
    version: 18,
    name: "relax-comment-post-foreign-key",
    statements: [
      `ALTER TABLE comment_likes RENAME TO comment_likes_old`,
      `ALTER TABLE comments RENAME TO comments_old`,
      `CREATE TABLE comments (
         id TEXT PRIMARY KEY NOT NULL,
         post_id TEXT NOT NULL,
         author_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         body TEXT NOT NULL,
         created_at TEXT NOT NULL,
         edited_at TEXT,
         parent_id TEXT REFERENCES comments (id) ON DELETE CASCADE,
         deleted_at TEXT,
         hidden_at TEXT,
         hidden_by TEXT REFERENCES users (id) ON DELETE SET NULL
       ) STRICT`,
      `INSERT INTO comments (id, post_id, author_id, body, created_at, edited_at, parent_id, deleted_at, hidden_at, hidden_by)
         SELECT id, post_id, author_id, body, created_at, edited_at, parent_id, deleted_at, hidden_at, hidden_by FROM comments_old`,
      `CREATE TABLE comment_likes (
         comment_id TEXT NOT NULL REFERENCES comments (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         created_at TEXT NOT NULL,
         PRIMARY KEY (comment_id, user_id)
       ) STRICT`,
      `INSERT INTO comment_likes (comment_id, user_id, created_at)
         SELECT comment_id, user_id, created_at FROM comment_likes_old`,
      `DROP TABLE comment_likes_old`,
      `DROP TABLE comments_old`,
      `CREATE INDEX comments_post ON comments (post_id, created_at)`,
      `CREATE INDEX comments_parent ON comments (parent_id)`,
    ],
  },
  {
    version: 19,
    name: "device-keys-and-packages",
    statements: [
      // Identità crittografica del dispositivo (ADR 0028).
      //
      // Ogni sessione genera una coppia di chiavi salvata in IndexedDB nel
      // client. L'istanza memorizza la chiave pubblica legata alla sessione
      // (`ON DELETE CASCADE` su `sessions`), così la revoca di una sessione
      // revoca automaticamente la chiave del dispositivo.
      `CREATE TABLE device_keys (
         id TEXT PRIMARY KEY NOT NULL,
         session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         public_key TEXT NOT NULL,
         algorithm TEXT NOT NULL,
         created_at TEXT NOT NULL,
         revoked_at TEXT
       ) STRICT`,
      `CREATE INDEX device_keys_user ON device_keys (user_id)`,
      `CREATE INDEX device_keys_session ON device_keys (session_id)`,
      // Magazzino dei KeyPackage MLS pre-pubblicati.
      //
      // Un mittente che vuole iniziare una conversazione E2E con un utente
      // consuma un KeyPackage monouso per ciascun dispositivo attivo dell'utente.
      `CREATE TABLE key_packages (
         id TEXT PRIMARY KEY NOT NULL,
         device_id TEXT NOT NULL REFERENCES device_keys (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         key_package TEXT NOT NULL,
         created_at TEXT NOT NULL,
         consumed_at TEXT
       ) STRICT`,
      `CREATE INDEX key_packages_user_unconsumed ON key_packages (user_id, consumed_at) WHERE consumed_at IS NULL`,
      `CREATE INDEX key_packages_device ON key_packages (device_id)`,
    ],
  },
  {
    version: 20,
    name: "key-backups",
    statements: [
      // Backup delle chiavi private e dello stato MLS protetto da passphrase (ADR 0028).
      //
      // Il client cifra le chiavi con PBKDF2 + AES-GCM e deposita questo blob.
      // L'istanza conserva il blob senza poterlo aprire. Quando l'utente effettua
      // l'accesso su un nuovo dispositivo, inserendo la passphrase recupera le
      // chiavi e decifra l'intera cronologia conservata sull'istanza.
      `CREATE TABLE key_backups (
         user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         encrypted_blob TEXT NOT NULL,
         algorithm TEXT NOT NULL,
         salt TEXT NOT NULL,
         iterations INTEGER NOT NULL,
         updated_at TEXT NOT NULL
       ) STRICT`,
    ],
  },
  {
    version: 21,
    name: "conversazioni-e-messaggi-e2e",
    statements: [
      // Conversazioni e messaggi E2E (ADR 0006, ADR 0027, ADR 0029).
      //
      // Nessuna colonna di testo in chiaro: solo la busta crittografica opaca.
      `CREATE TABLE conversazioni (
         id TEXT PRIMARY KEY NOT NULL,
         tipo TEXT NOT NULL CHECK (tipo IN ('diretta', 'gruppo')),
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE TABLE conversazione_membri (
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         joined_at TEXT NOT NULL,
         PRIMARY KEY (conversazione_id, user_id)
       ) STRICT`,
      `CREATE INDEX conversazione_membri_user ON conversazione_membri (user_id)`,
      `CREATE TABLE messaggi (
         id TEXT PRIMARY KEY NOT NULL,
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         sender_user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         sender_device_id TEXT NOT NULL REFERENCES device_keys (id) ON DELETE CASCADE,
         busta TEXT NOT NULL,
         created_at TEXT NOT NULL,
         consegnato_at TEXT
       ) STRICT`,
      `CREATE INDEX messaggi_conversazione_data ON messaggi (conversazione_id, created_at ASC)`,
      `CREATE TABLE conversazione_viste (
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
         visto_fino_a TEXT NOT NULL,
         PRIMARY KEY (conversazione_id, user_id)
       ) STRICT`,
    ],
  },
  {
    version: 22,
    name: "messaggi-in-uscita",
    statements: [
      // Coda di messaggi in uscita verso altre istanze (M6 Fase 3 / ADR 0029).
      // Contiene le buste E2E destinate a membri remoti (su istanze remote),
      // in attesa di essere consegnate. Un background job tenta l'invio
      // periodicamente e aggiorna tentativi e prossimo_invio.
      `CREATE TABLE messaggi_in_uscita (
         id TEXT PRIMARY KEY NOT NULL,
         messaggio_id TEXT NOT NULL REFERENCES messaggi (id) ON DELETE CASCADE,
         destinatario_chiave TEXT NOT NULL,
         busta TEXT NOT NULL,
         tentativi INTEGER NOT NULL DEFAULT 0,
         prossimo_invio TEXT NOT NULL,
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE INDEX messaggi_in_uscita_prossimo_invio ON messaggi_in_uscita (prossimo_invio ASC)`,
    ],
  },
  {
    version: 23,
    name: "messaggi-identita-remota",
    statements: [
      // Rimozione dei vincoli rigidi REFERENCES users/device_keys per supportare identità remote (ADR 0029, ADR 0030).
      `CREATE TABLE conversazione_membri_v23 (
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL,
         joined_at TEXT NOT NULL,
         PRIMARY KEY (conversazione_id, user_id)
       ) STRICT`,
      `INSERT INTO conversazione_membri_v23 (conversazione_id, user_id, joined_at)
       SELECT conversazione_id, user_id, joined_at FROM conversazione_membri`,
      `DROP TABLE conversazione_membri`,
      `ALTER TABLE conversazione_membri_v23 RENAME TO conversazione_membri`,
      `CREATE INDEX conversazione_membri_user ON conversazione_membri (user_id)`,

      `CREATE TABLE conversazione_viste_v23 (
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         user_id TEXT NOT NULL,
         visto_fino_a TEXT NOT NULL,
         PRIMARY KEY (conversazione_id, user_id)
       ) STRICT`,
      `INSERT INTO conversazione_viste_v23 (conversazione_id, user_id, visto_fino_a)
       SELECT conversazione_id, user_id, visto_fino_a FROM conversazione_viste`,
      `DROP TABLE conversazione_viste`,
      `ALTER TABLE conversazione_viste_v23 RENAME TO conversazione_viste`,

      `CREATE TABLE messaggi_v23 (
         id TEXT PRIMARY KEY NOT NULL,
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         sender_user_id TEXT NOT NULL,
         sender_device_id TEXT NOT NULL,
         busta TEXT NOT NULL,
         created_at TEXT NOT NULL,
         consegnato_at TEXT
       ) STRICT`,
      `INSERT INTO messaggi_v23 (id, conversazione_id, sender_user_id, sender_device_id, busta, created_at, consegnato_at)
       SELECT id, conversazione_id, sender_user_id, sender_device_id, busta, created_at, consegnato_at FROM messaggi`,
      `DROP TABLE messaggi`,
      `ALTER TABLE messaggi_v23 RENAME TO messaggi`,
      `CREATE INDEX messaggi_conversazione_data ON messaggi (conversazione_id, created_at ASC)`,
    ],
  },
  {
    version: 24,
    name: "conversazione-group-info",
    statements: [
      // Il GroupInfo di una conversazione (ADR 0038, spike S3): e' cio' da cui un
      // dispositivo nuovo riparte per rientrare nel gruppo MLS senza che nessun
      // altro sia online.
      //
      // Per l'istanza e' un blob OPACO: non lo apre e non lo interpreta, esattamente
      // come fa con le buste dei messaggi. L'`epoch` sta in una colonna sua proprio
      // perche' il server possa ordinare le versioni senza dover capire il contenuto:
      // accettare un GroupInfo piu' vecchio di quello che ha manderebbe chi rientra
      // verso un'epoch morta.
      //
      // Uno per conversazione: le versioni precedenti non servono a nessuno, perche'
      // si rientra sempre nel presente del gruppo.
      `CREATE TABLE conversazione_group_info (
         conversazione_id TEXT PRIMARY KEY NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         epoch INTEGER NOT NULL,
         group_info TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         updated_by TEXT NOT NULL
       ) STRICT`,
    ],
  },
  {
    version: 25,
    name: "archivio-conversazione",
    statements: [
      // L'archivio di una conversazione (ADR 0037, spike S2).
      //
      // Il trasporto ha la forward secrecy e distrugge le chiavi vecchie; la
      // cronologia sopravvive perche' il client, dopo aver decifrato, RICIFRA il
      // testo con una chiave d'archivio e deposita quello. Per l'istanza resta
      // un blob opaco come le buste: due garanzie diverse, stesso silenzio.
      //
      // Il mazzo e' una CATENA, non una chiave sola, e S2 ha misurato perche':
      // con una chiave immortale chi viene rimosso dal gruppo leggerebbe anche
      // il futuro dell'archivio, non solo il pregresso. Sta qui avvolto sotto la
      // chiave dell'epoch corrente, e si riavvolge a ogni cambio — stessa regola
      // del GroupInfo, epoch che non torna indietro.
      `CREATE TABLE conversazione_archivio_chiavi (
         conversazione_id TEXT PRIMARY KEY NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         epoch INTEGER NOT NULL,
         mazzo TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         updated_by TEXT NOT NULL
       ) STRICT`,

      // Le voci. `id` lo sceglie il client — di solito quello del messaggio — e
      // la chiave primaria composta rende il deposito ripetibile senza
      // duplicare: due dispositivi che archiviano la stessa conversazione non si
      // pestano i piedi.
      //
      // Nessun vincolo verso `messaggi`: l'archivio ha un ciclo di vita suo, ed
      // e' il punto di ADR 0037. Legarlo al trasporto disferebbe la separazione
      // che quella decisione costruisce — tanto piu' che il trasporto, dopo il
      // taglio netto di ADR 0038, si ritira.
      `CREATE TABLE archivio_voci (
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         id TEXT NOT NULL,
         chiave_n INTEGER NOT NULL,
         busta TEXT NOT NULL,
         created_at TEXT NOT NULL,
         PRIMARY KEY (conversazione_id, id)
       ) STRICT`,
      `CREATE INDEX archivio_voci_conversazione_data ON archivio_voci (conversazione_id, created_at ASC, id ASC)`,
    ],
  },
  {
    version: 26,
    name: "conversazione-handshake",
    statements: [
      // Il canale di handshake MLS (ADR 0038 punto 4).
      //
      // I messaggi applicativi vanno in `messaggi`; commit e Welcome sono
      // un'altra cosa e vanno qui. Un commit deve raggiungere TUTTI i membri
      // (`destinatario` NULL), un Welcome soltanto chi viene aggiunto — e chi
      // viene aggiunto non e' ancora nel gruppo crittografico, quindi non
      // potrebbe decifrare niente che passi dal canale dei membri.
      //
      // Per l'istanza restano buste opache, come tutto il resto: smista, non
      // legge. `epoch` sta a parte per lo stesso motivo del GroupInfo — serve a
      // ordinare senza dover capire.
      // `seq INTEGER PRIMARY KEY` e' l'alias del rowid: SQLite lo assegna in
      // ordine di inserimento, ed e' l'ordine di ARRIVO. Serve perche' MLS
      // applica i commit in sequenza, e due commit scritti nello stesso
      // millisecondo devono uscire nell'ordine in cui sono entrati —
      // applicarli all'incontrario spacca lo stato del gruppo.
      `CREATE TABLE conversazione_handshake (
         seq INTEGER PRIMARY KEY,
         id TEXT NOT NULL UNIQUE,
         conversazione_id TEXT NOT NULL REFERENCES conversazioni (id) ON DELETE CASCADE,
         epoch INTEGER NOT NULL,
         tipo TEXT NOT NULL,
         destinatario TEXT,
         busta TEXT NOT NULL,
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE INDEX conversazione_handshake_coda
         ON conversazione_handshake (conversazione_id, seq ASC)`,
    ],
  },
];
