export interface HealthResponse {
  status: "ok";
}

export const healthResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: {
      type: "string",
      const: "ok",
    },
  },
} as const;

/**
 * An instance is `unconfigured` until an administrator completes the first-run
 * setup. The identity keypair exists from the very first boot regardless.
 */
export type InstanceState = "unconfigured" | "configured";

/**
 * Whether the data directory survives the next image update.
 *
 * Two of the four say the data is at risk, and the difference between them is
 * only how long it takes.
 *
 * `ephemeral` is the immediate one: data in the container's writable layer
 * works perfectly and is gone the moment the container is recreated, which is
 * exactly what updating does.
 *
 * `anonymous` is the one that took two incidents to see. `VOLUME /data` in the
 * image means an instance started without any mapping gets a volume Docker
 * named itself — durable **only if whoever recreates the container carries the
 * old mounts over**. Compose does. A NAS panel updating a container built by
 * hand does not, and neither do Portainer's recreate, Watchtower, or
 * `docker run` after a `docker rm`: each of them hands the new container a
 * fresh, empty anonymous volume and leaves the old one orphaned on the disk.
 * The instance comes back `unconfigured` with a new key, update after update.
 *
 * Both cost the instance private key, which is not replaceable.
 */
export type DataDurability = "persistent" | "anonymous" | "ephemeral" | "unknown";

export const DATA_DURABILITIES: readonly DataDurability[] = [
  "persistent",
  "anonymous",
  "ephemeral",
  "unknown",
];

/**
 * Whether data placed here would be at risk of vanishing on an update. The
 * instance refuses to be configured on these (ADR 0019).
 */
export function dataAtRisk(durability: DataDurability): boolean {
  return durability === "ephemeral" || durability === "anonymous";
}

/** Public description of an instance. Safe to show to a prospective member. */
export interface InstancePublicView {
  state: InstanceState;
  /** Absent while the instance is still unconfigured. */
  name?: string;
  description?: string;
  /** Base64url-encoded Ed25519 public key. Stable for the life of the instance. */
  publicKey: string;
  memberCount: number;
  /**
   * Present only while the instance is still `unconfigured`, when the only
   * person looking is whoever is setting it up — and warning them before they
   * put a community's data in is worth far more than after.
   */
  dataDurability?: DataDurability;
}

export const instancePublicViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "publicKey", "memberCount"],
  properties: {
    state: { type: "string", enum: ["unconfigured", "configured"] },
    name: { type: "string" },
    description: { type: "string" },
    publicKey: { type: "string" },
    memberCount: { type: "integer", minimum: 0 },
    dataDurability: { type: "string", enum: DATA_DURABILITIES },
  },
} as const;

/** Usernames are lower-cased and restricted to a shape that reads unambiguously. */
export const USERNAME_PATTERN = "^[a-z0-9](?:[a-z0-9_.-]{1,30}[a-z0-9])$";

/** Long enough to matter; the real work is done by Argon2id (ADR 0008). */
export const PASSWORD_MIN_LENGTH = 12;

export type UserRole = "instance_admin" | "instance_moderator" | "member";

export const USER_ROLES: readonly UserRole[] = ["instance_admin", "instance_moderator", "member"];

export interface InstanceSetupRequest {
  name: string;
  description?: string;
  setupToken: string;
  /** The first account, which is always the instance administrator. */
  adminUsername: string;
  adminPassword: string;
  adminDisplayName?: string;
}

export const instanceSetupRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "setupToken", "adminUsername", "adminPassword"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 100 },
    description: { type: "string", maxLength: 500 },
    setupToken: { type: "string", minLength: 1 },
    adminUsername: { type: "string", pattern: USERNAME_PATTERN },
    adminPassword: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 200 },
    adminDisplayName: { type: "string", maxLength: 100 },
  },
} as const;

/**
 * Setup answers with the recovery code **once**. It is never retrievable
 * afterwards: the administrator writes it down and keeps it off the instance
 * (ADR 0009).
 */
/**
 * La verifica del solo codice di configurazione.
 *
 * Esiste perché il codice era l'ultima cosa controllata e la prima da scrivere:
 * si compilavano sei campi, si premeva, e solo allora si scopriva che il codice
 * era sbagliato — e cambia a ogni riavvio dell'istanza, quindi sbagliarlo è
 * facile. Prevenire l'errore vale più che segnalarlo.
 *
 * **Non autorizza niente.** `setup` continua a verificare il codice per conto
 * proprio: questa rotta è comodità, non controllo d'accesso, e ha la stessa
 * limitazione di frequenza e lo stesso confronto a tempo costante — indovinare
 * un codice non deve costare meno di prima solo perché c'è una porta in più.
 */
export interface VerifySetupTokenRequest {
  setupToken: string;
}

export const verifySetupTokenRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["setupToken"],
  properties: {
    setupToken: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

export interface InstanceSetupResponse {
  instance: InstancePublicView;
  recoveryCode: string;
}

export const instanceSetupResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instance", "recoveryCode"],
  properties: {
    instance: instancePublicViewSchema,
    recoveryCode: { type: "string" },
  },
} as const;

export interface RecoveryRequest {
  username: string;
  recoveryCode: string;
  newPassword: string;
}

export const recoveryRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["username", "recoveryCode", "newPassword"],
  properties: {
    username: { type: "string", minLength: 1, maxLength: 64 },
    recoveryCode: { type: "string", minLength: 1, maxLength: 64 },
    newPassword: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 200 },
  },
} as const;

/** Using a code spends it, so a fresh one is issued and shown once. */
export interface RecoveryResponse {
  recoveryCode: string;
  revokedSessions: number;
}

export const recoveryResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recoveryCode", "revokedSessions"],
  properties: {
    recoveryCode: { type: "string" },
    revokedSessions: { type: "integer", minimum: 0 },
  },
} as const;

/** The caller's own identity. Never includes credential material. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export const authenticatedUserSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "username", "displayName", "role"],
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    displayName: { type: "string" },
    role: { type: "string", enum: USER_ROLES },
  },
} as const;

export interface LoginRequest {
  username: string;
  password: string;
  /** Free-form label shown in the device list, e.g. "Portatile di casa". */
  deviceLabel?: string;
}

export const loginRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["username", "password"],
  properties: {
    username: { type: "string", minLength: 1, maxLength: 64 },
    password: { type: "string", minLength: 1, maxLength: 200 },
    deviceLabel: { type: "string", maxLength: 100 },
  },
} as const;

export interface LoginResponse {
  /** Returned once, at login. The instance stores only its hash. */
  token: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export const loginResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["token", "expiresAt", "user"],
  properties: {
    token: { type: "string" },
    expiresAt: { type: "string" },
    user: authenticatedUserSchema,
  },
} as const;

/**
 * Where a content is allowed to go. The absence of a value means `local`,
 * never `public` (PROJECT_SPEC §6).
 */
export type ContentScope = "local" | "followers" | "public";

export const CONTENT_SCOPES: readonly ContentScope[] = ["local", "followers", "public"];

/**
 * Quale dei due feed si sta leggendo.
 *
 * Non è un filtro sopra un elenco unico: sono le due superfici di
 * [ADR 0018] — l'istanza, che non esce di casa, e la rete, che raggiunge chi
 * segue — e **i post non si sovrappongono**. Un post sta in uno o nell'altro,
 * mai in tutti e due, ed è ciò che rende vero per costruzione l'invariante di
 * `PROJECT_SPEC` §3: se un post locale non compare fra quelli di rete, il feed
 * locale non può essere federato per errore.
 *
 * `locale` è il default per la stessa ragione per cui lo è `local` fra gli
 * scope: niente esce di casa perché qualcuno non ha deciso.
 */
export const FEED_KINDS = ["locale", "seguiti"] as const;

export type FeedKind = (typeof FEED_KINDS)[number];

export const FEED_PREDEFINITO: FeedKind = "locale";

/** Lo scope che un post assume quando viene scritto da dentro un feed. */
export function scopeDelFeed(feed: FeedKind): ContentScope {
  return feed === "locale" ? "local" : "followers";
}

export const POST_MAX_LENGTH = 5000;
export const COMMENT_MAX_LENGTH = 2000;

/** Author as the feed shows it. Never carries anything but public identity. */
export interface AuthorView {
  id: string;
  username: string;
  displayName: string;
}

export const authorViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "username", "displayName"],
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    displayName: { type: "string" },
  },
} as const;

/**
 * How many images one post may carry, and how long a description of one may
 * be. Both are product limits rather than technical ones: a neighbourhood post
 * with a dozen photos is a gallery, and this is a board.
 */
export const MEDIA_MAX_PER_POST = 4;
export const MEDIA_ALT_TEXT_MAX_LENGTH = 300;

/** Answer to an upload. The bytes live behind an authenticated route (ADR 0012). */
export interface MediaView {
  id: string;
  width: number;
  height: number;
  byteSize: number;
  thumbWidth: number;
  thumbHeight: number;
}

export const mediaViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "width", "height", "byteSize", "thumbWidth", "thumbHeight"],
  properties: {
    id: { type: "string" },
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    byteSize: { type: "integer", minimum: 1 },
    thumbWidth: { type: "integer", minimum: 1 },
    thumbHeight: { type: "integer", minimum: 1 },
  },
} as const;

/** An image as the feed shows it, with the dimensions needed to reserve its space. */
export interface PostImageView {
  id: string;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  altText: string;
}

export const postImageViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "width", "height", "thumbWidth", "thumbHeight", "altText"],
  properties: {
    id: { type: "string" },
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    thumbWidth: { type: "integer", minimum: 1 },
    thumbHeight: { type: "integer", minimum: 1 },
    altText: { type: "string" },
  },
} as const;

/** An already uploaded image, claimed by the post being written. */
export interface PostMediaInput {
  id: string;
  altText?: string;
}

export const postMediaInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 64 },
    altText: { type: "string", maxLength: MEDIA_ALT_TEXT_MAX_LENGTH },
  },
} as const;

export interface CommentView {
  id: string;
  postId: string;
  /** Null for a top-level comment; otherwise the comment being answered (immediate parent). */
  parentId: string | null;
  author: AuthorView;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** True when moderation hid it; the body is emptied for everyone but its author. */
  hidden: boolean;
  /**
   * Una lapide: il commento è stato eliminato, ma teneva su delle risposte.
   *
   * Senza di essa quelle risposte sparirebbero dall'albero pur restando nel
   * database e nel conteggio — irraggiungibili anche da chi modera. Il corpo è
   * vuoto e non c'è niente da fare su di essa: esiste solo per non spezzare il
   * ramo che regge.
   */
  deleted: boolean;
  likeCount: number;
  liked: boolean;
  /** Whether the caller may edit the body. */
  canEdit: boolean;
  /** Whether the caller may delete it. */
  canDelete: boolean;
  /** Whether the caller may hide it. */
  canModerate: boolean;
}

export const commentViewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "postId",
    "parentId",
    "author",
    "body",
    "createdAt",
    "editedAt",
    "hidden",
    "deleted",
    "likeCount",
    "liked",
    "canEdit",
    "canDelete",
    "canModerate",
  ],
  properties: {
    id: { type: "string" },
    postId: { type: "string" },
    parentId: { type: ["string", "null"] },
    author: authorViewSchema,
    body: { type: "string" },
    createdAt: { type: "string" },
    editedAt: { type: ["string", "null"] },
    hidden: { type: "boolean" },
    deleted: { type: "boolean" },
    likeCount: { type: "integer", minimum: 0 },
    liked: { type: "boolean" },
    canEdit: { type: "boolean" },
    canDelete: { type: "boolean" },
    canModerate: { type: "boolean" },
  },
} as const;

export interface PostView {
  id: string;
  author: AuthorView;
  body: string;
  scope: ContentScope;
  createdAt: string;
  editedAt: string | null;
  hidden: boolean;
  likeCount: number;
  /** Whether the caller has liked it. */
  liked: boolean;
  commentCount: number;
  canDelete: boolean;
  canModerate: boolean;
  /** Empty for a post with no images; hidden posts lose theirs like the body. */
  images: PostImageView[];
  /**
   * Presente solo per un post che **arriva da un'altra istanza** ([ADR 0023]).
   *
   * La sua assenza vuol dire «di casa», che è il caso normale. Quando c'è,
   * dice tre cose che l'interfaccia non deve tacere: da quale casa arriva, con
   * quale nome quella casa si presenta — dichiarato da lei, mai verificato
   * (ADR 0020 §5) — e quante fotografie ha il post. I byte delle fotografie
   * arrivano a parte, in proxy sotto la sessione di chi legge ([ADR 0023] §4).
   *
   * Porta anche il perché di ciò che manca: su un post remoto non si mette un
   * cuore e non si risponde, perché le reazioni e i commenti vivono sulla
   * macchina di chi ha scritto e questa versione non ha un modo di spedirceli.
   */
  remoto?: RemoteOrigin;
}

export interface RemoteOrigin {
  /** La chiave pubblica dell'istanza: l'unica cosa verificata di lei. */
  instanceKey: string;
  /** Come quell'istanza chiama sé stessa. Dichiarato, mai verificato. */
  istanza: string;
  /** Quante immagini ha il post. I byte arrivano a parte. */
  immagini: number;
}

export const remoteOriginSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instanceKey", "istanza", "immagini"],
  properties: {
    instanceKey: { type: "string" },
    istanza: { type: "string" },
    immagini: { type: "integer", minimum: 0 },
  },
} as const;

export const postViewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "author",
    "body",
    "scope",
    "createdAt",
    "editedAt",
    "hidden",
    "likeCount",
    "liked",
    "commentCount",
    "canDelete",
    "canModerate",
    "images",
  ],
  properties: {
    id: { type: "string" },
    author: authorViewSchema,
    body: { type: "string" },
    scope: { type: "string", enum: CONTENT_SCOPES },
    createdAt: { type: "string" },
    editedAt: { type: ["string", "null"] },
    hidden: { type: "boolean" },
    likeCount: { type: "integer", minimum: 0 },
    liked: { type: "boolean" },
    commentCount: { type: "integer", minimum: 0 },
    canDelete: { type: "boolean" },
    canModerate: { type: "boolean" },
    images: { type: "array", items: postImageViewSchema },
    remoto: remoteOriginSchema,
  },
} as const;

export interface CreatePostRequest {
  /** May be empty when the post carries images: a photo is something to say. */
  body: string;
  /** Omitting it means `local`. Nothing ever defaults to `public`. */
  scope?: ContentScope;
  /** Images already uploaded by the caller, in the order they should appear. */
  media?: PostMediaInput[];
}

export const createPostRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: {
    body: { type: "string", maxLength: POST_MAX_LENGTH },
    scope: { type: "string", enum: CONTENT_SCOPES },
    media: { type: "array", maxItems: MEDIA_MAX_PER_POST, items: postMediaInputSchema },
  },
} as const;

export interface CreateCommentRequest {
  body: string;
  /** Answer another comment on the same post; omitted for a top-level comment. */
  parentId?: string;
}

export const createCommentRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: {
    body: { type: "string", minLength: 1, maxLength: COMMENT_MAX_LENGTH },
    parentId: { type: "string", minLength: 1 },
  },
} as const;

export interface UpdateCommentRequest {
  body: string;
}

export const updateCommentRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["body"],
  properties: {
    body: { type: "string", minLength: 1, maxLength: COMMENT_MAX_LENGTH },
  },
} as const;

export interface TimelinePage {
  posts: PostView[];
  /** Opaque cursor for the next page; absent when the timeline ends. */
  nextCursor?: string;
  /**
   * Le case che non hanno risposto, quando ce ne sono ([ADR 0023] §5).
   *
   * Un'istanza spenta rende il feed **incompleto e non rotto**, e il modo di
   * non ingannare nessuno è dire quale parte manca. Assente vuol dire che
   * hanno risposto tutte — non che non ce ne fossero.
   */
  mancanti?: MissingSource[];
}

export interface MissingSource {
  instanceKey: string;
  /** Il nome che quell'istanza si dà, o vuoto se non lo ha mai dichiarato. */
  istanza: string;
}

export const missingSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instanceKey", "istanza"],
  properties: {
    instanceKey: { type: "string" },
    istanza: { type: "string" },
  },
} as const;

export const timelinePageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: { type: "array", items: postViewSchema },
    nextCursor: { type: "string" },
    mancanti: { type: "array", items: missingSourceSchema },
  },
} as const;

export const commentListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["comments"],
  properties: { comments: { type: "array", items: commentViewSchema } },
} as const;

export interface LikeResponse {
  likeCount: number;
  liked: boolean;
}

export const likeResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["likeCount", "liked"],
  properties: {
    likeCount: { type: "integer", minimum: 0 },
    liked: { type: "boolean" },
  },
} as const;

export interface CreateInviteRequest {
  /** Free-form note for the administrator, e.g. "Scala B". Never shown to the invitee. */
  label?: string;
  /** 1 means single use. Reusable invites carry more risk and are opt-in. */
  maxUses?: number;
  expiresInHours?: number;
}

export const createInviteRequestSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string", maxLength: 100 },
    maxUses: { type: "integer", minimum: 1, maximum: 100 },
    expiresInHours: { type: "integer", minimum: 1, maximum: 8760 },
  },
} as const;

export interface InviteView {
  id: string;
  label: string;
  maxUses: number;
  usedCount: number;
  createdAt: string;
  expiresAt: string;
  /** False once revoked, expired or exhausted. */
  usable: boolean;
}

export const inviteViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "maxUses", "usedCount", "createdAt", "expiresAt", "usable"],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    maxUses: { type: "integer" },
    usedCount: { type: "integer" },
    createdAt: { type: "string" },
    expiresAt: { type: "string" },
    usable: { type: "boolean" },
  },
} as const;

/** The code is returned once, at creation. Only its hash is stored. */
export interface CreateInviteResponse {
  code: string;
  invite: InviteView;
  /**
   * Link completo da mandare, costruito dall'indirizzo con cui l'amministratore
   * ha raggiunto **l'istanza** (l'Host della richiesta API), non dalla barra
   * del browser del client di sviluppo. Così un invito creato da Vite su
   * localhost porta comunque all'IP del NAS.
   */
  joinUrl: string;
}

export const createInviteResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "invite", "joinUrl"],
  properties: {
    code: { type: "string" },
    invite: inviteViewSchema,
    joinUrl: { type: "string", minLength: 1 },
  },
} as const;

export const inviteListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["invites"],
  properties: { invites: { type: "array", items: inviteViewSchema } },
} as const;

export interface JoinRequestSubmission {
  inviteCode: string;
  username: string;
  password: string;
  displayName?: string;
  /** Free-form note to the administrator: "sono del secondo piano". */
  message?: string;
}

export const joinRequestSubmissionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["inviteCode", "username", "password"],
  properties: {
    inviteCode: { type: "string", minLength: 1, maxLength: 64 },
    username: { type: "string", pattern: USERNAME_PATTERN },
    password: { type: "string", minLength: PASSWORD_MIN_LENGTH, maxLength: 200 },
    displayName: { type: "string", maxLength: 100 },
    message: { type: "string", maxLength: 500 },
  },
} as const;

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export interface JoinRequestView {
  id: string;
  username: string;
  displayName: string;
  message: string;
  status: JoinRequestStatus;
  createdAt: string;
}

export const joinRequestViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "username", "displayName", "message", "status", "createdAt"],
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    displayName: { type: "string" },
    message: { type: "string" },
    status: { type: "string", enum: ["pending", "approved", "rejected"] },
    createdAt: { type: "string" },
  },
} as const;

export const joinRequestListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requests"],
  properties: { requests: { type: "array", items: joinRequestViewSchema } },
} as const;

/** Never carries credential material: only what happened, and to whom. */
export interface AuditEventView {
  id: string;
  action: string;
  subject: string;
  actorUsername: string | null;
  createdAt: string;
}

export const auditListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "action", "subject", "actorUsername", "createdAt"],
        properties: {
          id: { type: "string" },
          action: { type: "string" },
          subject: { type: "string" },
          actorUsername: { type: ["string", "null"] },
          createdAt: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * ADR 0007 requires the instance to report the truth about at-rest protection.
 * `unknown` is a first-class value: claiming `active` without verifying would
 * be exactly the false assurance the decision forbids.
 */
export type AtRestEncryptionState = "unknown" | "active" | "inactive";

/**
 * What the administrator says they set up. The instance can see **that** a
 * volume is encrypted, never **how it is unlocked**: a passphrase typed by a
 * person and a key file on the disk produce the same device. So the level is
 * declared, and the instance checks it against what it can observe.
 */
export type AtRestDeclaredLevel = "passphrase" | "automatic" | "none" | "unspecified";

export const AT_REST_DECLARED_LEVELS: readonly AtRestDeclaredLevel[] = [
  "passphrase",
  "automatic",
  "none",
  "unspecified",
];

export interface AtRestReport {
  /** What the instance could observe on its own. */
  detected: AtRestEncryptionState;
  /** The same thing in a sentence an administrator can act on. */
  detail: string;
  declared: AtRestDeclaredLevel;
  /**
   * False when the declaration claims a protection the instance cannot see.
   * That case is the whole point of ADR 0007 requirement 2.
   */
  consistent: boolean;
}

export const atRestReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["detected", "detail", "declared", "consistent"],
  properties: {
    detected: { type: "string", enum: ["unknown", "active", "inactive"] },
    detail: { type: "string" },
    declared: { type: "string", enum: AT_REST_DECLARED_LEVELS },
    consistent: { type: "boolean" },
  },
} as const;

/**
 * Whether a backup preceded the migrations of an upgrade (ADR 0014).
 *
 * `not_configured` and `failed` are told apart on purpose, and not only for
 * precision: one is an administrator being reminded of something they chose,
 * the other is an administrator who believes they are protected and is not.
 */
export type SchemaBackupStatus = "created" | "not_configured" | "failed";

/** The last time this instance moved its schema forward, and how it went. */
export interface SchemaUpgradeView {
  appliedAt: string;
  fromVersion: number;
  toVersion: number;
  migrationCount: number;
  backupStatus: SchemaBackupStatus;
  /** File name of the archive written just before, when there is one. */
  backupName?: string;
  /** The same thing in a sentence an administrator can act on. */
  detail: string;
}

export const schemaUpgradeViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["appliedAt", "fromVersion", "toVersion", "migrationCount", "backupStatus", "detail"],
  properties: {
    appliedAt: { type: "string" },
    fromVersion: { type: "integer", minimum: 0 },
    toVersion: { type: "integer", minimum: 0 },
    migrationCount: { type: "integer", minimum: 1 },
    backupStatus: { type: "string", enum: ["created", "not_configured", "failed"] },
    backupName: { type: "string" },
    detail: { type: "string" },
  },
} as const;

/**
 * How the scheduled backups are actually doing (ADR 0013).
 *
 * `not_configured` is a choice the administrator made; `missing` and `stale`
 * are backups they believe in that are not happening. The two are told apart
 * because a protection believed and absent is worse than one absent and known.
 */
export type BackupHealth = "not_configured" | "waiting" | "healthy" | "stale" | "missing";

export interface BackupArchiveView {
  name: string;
  byteSize: number;
  modifiedAt: string;
}

export interface BackupReport {
  health: BackupHealth;
  /** The same thing in a sentence an administrator can act on. */
  detail: string;
  intervalHours?: number;
  keep?: number;
  /** Newest periodic archive. */
  last?: BackupArchiveView;
  /** Newest archive written just before a migration (ADR 0014). */
  lastUpgradeArchive?: BackupArchiveView;
  /**
   * Present only when the container's memory limit is measurably too small for
   * the data this instance holds. An archive is encrypted whole in memory
   * (ADR 0013), so that failure is a kill without a log line — worth predicting
   * rather than discovering.
   */
  memoryWarning?: string;
}

const backupArchiveViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "byteSize", "modifiedAt"],
  properties: {
    name: { type: "string" },
    byteSize: { type: "integer", minimum: 0 },
    modifiedAt: { type: "string" },
  },
} as const;

export const backupReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["health", "detail"],
  properties: {
    health: {
      type: "string",
      enum: ["not_configured", "waiting", "healthy", "stale", "missing"],
    },
    detail: { type: "string" },
    intervalHours: { type: "integer", minimum: 1 },
    keep: { type: "integer", minimum: 1 },
    last: backupArchiveViewSchema,
    lastUpgradeArchive: backupArchiveViewSchema,
    memoryWarning: { type: "string" },
  },
} as const;

/**
 * Backup settings as the panel sees them (ADR 0016).
 *
 * `editable` is false where the environment carries the configuration: two
 * sources of truth that can disagree in silence are worse than one inconvenient
 * one, so the panel shows the value and says where it comes from rather than
 * offering an edit the next restart would undo.
 */
export interface BackupSettingsView {
  configured: boolean;
  editable: boolean;
  source: "environment" | "panel";
  /** Where archives are written. Never settable from here. */
  directory: string;
  /** True when that directory sits beside the data, which is half a backup. */
  directoryIsBesideData: boolean;
  /** Absent until one is set. Only ever the public half. */
  publicKey?: string;
  intervalHours: number;
  keep: number;
}

export const backupSettingsViewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "configured",
    "editable",
    "source",
    "directory",
    "directoryIsBesideData",
    "intervalHours",
    "keep",
  ],
  properties: {
    configured: { type: "boolean" },
    editable: { type: "boolean" },
    source: { type: "string", enum: ["environment", "panel"] },
    directory: { type: "string" },
    directoryIsBesideData: { type: "boolean" },
    publicKey: { type: "string" },
    intervalHours: { type: "integer", minimum: 1, maximum: 720 },
    keep: { type: "integer", minimum: 1, maximum: 365 },
  },
} as const;

export interface UpdateBackupSettings {
  /** Empty or absent turns scheduled backups off. */
  publicKey?: string;
  intervalHours: number;
  keep: number;
}

export const updateBackupSettingsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intervalHours", "keep"],
  properties: {
    publicKey: { type: "string", maxLength: 200 },
    intervalHours: { type: "integer", minimum: 1, maximum: 720 },
    keep: { type: "integer", minimum: 1, maximum: 365 },
  },
} as const;

/** Returned once, at creation. The private half never touches the database. */
export interface BackupKeyPairResponse {
  publicKey: string;
  privateKey: string;
}

export const backupKeyPairResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["publicKey", "privateKey"],
  properties: {
    publicKey: { type: "string" },
    privateKey: { type: "string" },
  },
} as const;

export const backupArchiveListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["archives"],
  properties: {
    archives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "byteSize", "modifiedAt"],
        properties: {
          name: { type: "string" },
          byteSize: { type: "integer", minimum: 0 },
          modifiedAt: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Which kind of network a connection arrived from (M4, ADR 0004).
 *
 * `overlay` is the shared address space a mesh VPN hands out — and also what an
 * ISP uses for carrier-grade NAT. The instance cannot tell those apart from the
 * socket, so it does not pretend to.
 */
export type ConnectionOrigin = "loopback" | "local" | "overlay" | "public";

export const CONNECTION_ORIGINS: readonly ConnectionOrigin[] = [
  "loopback",
  "local",
  "overlay",
  "public",
];

/** Counts and last-seen only. No address is kept anywhere. */
export interface OriginSighting {
  origin: ConnectionOrigin;
  count: number;
  lastAt: string;
}

const originSightingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["origin", "count", "lastAt"],
  properties: {
    origin: { type: "string", enum: CONNECTION_ORIGINS },
    count: { type: "integer", minimum: 0 },
    lastAt: { type: "string" },
  },
} as const;

/** What the caller is arriving through, so the interface can say it. */
export interface ConnectionView {
  origin: ConnectionOrigin;
  detail: string;
}

export const connectionViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["origin", "detail"],
  properties: {
    origin: { type: "string", enum: CONNECTION_ORIGINS },
    detail: { type: "string" },
  },
} as const;

/**
 * The network probe of ADR 0018, which measures and carries nothing else.
 *
 * `unavailable` is a first-class value: the transport is a compiled module, and
 * an instance that cannot load it has to say so and keep working, rather than
 * refuse to start.
 */
export type NetworkProbeState = "off" | "unavailable" | "ready";

export type NetworkProbeMode = "off" | "local" | "internet";

export const NETWORK_PROBE_MODES: readonly NetworkProbeMode[] = ["off", "local", "internet"];

export interface NetworkProbeReport {
  state: NetworkProbeState;
  /** The same thing in a sentence an administrator can act on. */
  detail: string;
  /** What it is set to, which is not the same as how it turned out. */
  mode: NetworkProbeMode;
  /**
   * False while `ESTIA_NETWORK_PROBE` carries the setting: then the panel shows
   * the value and says where it comes from, instead of offering a change the
   * next restart would undo. Same rule as the backups (ADR 0016).
   */
  editable: boolean;
  /**
   * This instance's network identity: an ed25519 public key.
   *
   * Fixed for the life of the instance, and the only thing ADR 0018 asks two
   * administrators to exchange. It does not expire and it does not say where
   * the instance lives.
   */
  endpointId?: string;
  /**
   * The key plus the addresses where it can be found right now.
   *
   * Needed only where nothing can look a key up — see `reachableByKey`. It goes
   * stale when the addresses change, which is why it is not the thing to share.
   */
  ticket?: string;
  /** Whether public infrastructure is used to be found. */
  usesPublicInfrastructure?: boolean;
  /** Whether the key alone is enough for another instance to get here. */
  reachableByKey?: boolean;
}

export const networkProbeReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "detail", "mode", "editable"],
  properties: {
    state: { type: "string", enum: ["off", "unavailable", "ready"] },
    detail: { type: "string" },
    mode: { type: "string", enum: NETWORK_PROBE_MODES },
    editable: { type: "boolean" },
    endpointId: { type: "string" },
    ticket: { type: "string" },
    usesPublicInfrastructure: { type: "boolean" },
    reachableByKey: { type: "boolean" },
  },
} as const;

export interface UpdateNetworkProbe {
  mode: NetworkProbeMode;
}

export const updateNetworkProbeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mode"],
  properties: { mode: { type: "string", enum: NETWORK_PROBE_MODES } },
} as const;

export interface NetworkProbeRequest {
  /** The other instance's ticket, as its own panel shows it. */
  ticket: string;
}

export const networkProbeRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ticket"],
  properties: { ticket: { type: "string", minLength: 1, maxLength: 4096 } },
} as const;

export interface NetworkProbeResult {
  reached: boolean;
  detail: string;
  elapsedMs?: number;
  /** False when the packets went straight there, true when a relay carried them. */
  viaRelay?: boolean;
  pathRttMs?: number;
  remoteEndpointId?: string;
}

export const networkProbeResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reached", "detail"],
  properties: {
    reached: { type: "boolean" },
    detail: { type: "string" },
    elapsedMs: { type: "number", minimum: 0 },
    viaRelay: { type: "boolean" },
    pathRttMs: { type: "number", minimum: 0 },
    remoteEndpointId: { type: "string" },
  },
} as const;

export interface AdminDiagnostics {
  instanceState: InstanceState;
  memberCount: number;
  atRest: AtRestReport;
  backups: BackupReport;
  /**
   * False when the data directory could not be tightened to 0700 — a network
   * share that refuses `chmod`, a bind mount on a filesystem without modes.
   * It was only ever a log line, and a permission nobody applied is exactly the
   * kind of thing that has to be visible (SECURITY_BASELINE §4).
   */
  dataDirectorySecure: boolean;
  /** Whether the data will still be there after the next update. */
  dataDurability: DataDurability;
  /** The same thing in a sentence an administrator can act on. */
  dataDurabilityDetail: string;
  /** Which kinds of network have reached this instance since it started. */
  connections: OriginSighting[];
  /** The measurement rig of ADR 0018: off unless asked for. */
  network: NetworkProbeReport;
  /** Absent on an instance whose schema has never moved after its first boot. */
  lastUpgrade?: SchemaUpgradeView;
}

export const adminDiagnosticsSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "instanceState",
    "memberCount",
    "atRest",
    "backups",
    "dataDirectorySecure",
    "dataDurability",
    "dataDurabilityDetail",
    "connections",
    "network",
  ],
  properties: {
    instanceState: { type: "string", enum: ["unconfigured", "configured"] },
    memberCount: { type: "integer", minimum: 0 },
    atRest: atRestReportSchema,
    backups: backupReportSchema,
    dataDirectorySecure: { type: "boolean" },
    dataDurability: { type: "string", enum: DATA_DURABILITIES },
    dataDurabilityDetail: { type: "string" },
    connections: { type: "array", items: originSightingSchema },
    network: networkProbeReportSchema,
    lastUpgrade: schemaUpgradeViewSchema,
  },
} as const;

/**
 * What «Verifica aggiornamenti» returns. The panel only shows the terminal
 * commands when `status` is `available` — updating is a host gesture, not an
 * in-app button that pretends to talk to Docker.
 */
export type UpdateCheckStatus = "up_to_date" | "available" | "unknown";

export interface UpdateCheckResult {
  status: UpdateCheckStatus;
  /** One sentence an administrator can act on. */
  detail: string;
  /** Image ref compared against, e.g. `ghcr.io/chrono-web/estia:latest`. */
  channel: string;
  /** Commit this instance was built from, when the image declares it. */
  currentRevision?: string;
  /** Commit published on the channel, when the registry answers. */
  latestRevision?: string;
  checkedAt: string;
}

export const updateCheckResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "detail", "channel", "checkedAt"],
  properties: {
    status: { type: "string", enum: ["up_to_date", "available", "unknown"] },
    detail: { type: "string" },
    channel: { type: "string" },
    currentRevision: { type: "string", minLength: 7, maxLength: 40 },
    latestRevision: { type: "string", minLength: 7, maxLength: 40 },
    checkedAt: { type: "string", format: "date-time" },
  },
} as const;

export interface SessionView {
  id: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** True for the session making the request. */
  current: boolean;
}

export const sessionListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["sessions"],
  properties: {
    sessions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "deviceLabel", "createdAt", "lastSeenAt", "expiresAt", "current"],
        properties: {
          id: { type: "string" },
          deviceLabel: { type: "string" },
          createdAt: { type: "string" },
          lastSeenAt: { type: "string" },
          expiresAt: { type: "string" },
          current: { type: "boolean" },
        },
      },
    },
  },
} as const;

export interface ErrorResponse {
  /** Stable machine-readable code. Safe to branch on. */
  code: string;
  /** Human-readable message that never contains secrets. */
  message: string;
}

export const errorResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "message"],
  properties: {
    code: { type: "string" },
    message: { type: "string" },
  },
} as const;

/**
 * The instances this one has a relationship with (ADR 0020, ADR 0021).
 *
 * A **relationship**, never a log of traffic: an instance that merely knocked
 * is not here and is not anywhere else either. What a row means is that
 * somebody decided something — asked, was asked, accepted, or refused.
 */
export const FEDERATION_STATES = [
  "richiesta_inviata",
  "richiesta_ricevuta",
  "collegata",
  "bloccata",
] as const;

export type FederationState = (typeof FEDERATION_STATES)[number];

export interface FederatedInstanceView {
  /** The other instance's ed25519 public key: fixed, and its address. */
  publicKey: string;
  /**
   * What it calls itself.
   *
   * **Declared, never verified** (ADR 0020 §5): an instance can say anything
   * about who it hosts, and a signature proves who is speaking, not that they
   * are telling the truth. The interface must present this as something the
   * other instance says about itself — no check marks, no «verified».
   */
  declaredName: string;
  state: FederationState;
  createdAt: string;
  /** Null until it has ever answered. */
  lastSeenAt: string | null;
  /** How the last exchange travelled, which is worth seeing rather than assuming. */
  lastReachedVia: "diretto" | "relay" | null;
}

export const federatedInstanceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["publicKey", "declaredName", "state", "createdAt", "lastSeenAt", "lastReachedVia"],
  properties: {
    publicKey: { type: "string" },
    declaredName: { type: "string" },
    state: { type: "string", enum: FEDERATION_STATES },
    createdAt: { type: "string" },
    lastSeenAt: { type: ["string", "null"] },
    lastReachedVia: { type: ["string", "null"], enum: ["diretto", "relay", null] },
  },
} as const;

export interface FederationView {
  instances: FederatedInstanceView[];
  /** This instance's own key: the one thing to hand to somebody else. */
  endpointId?: string;
  /** False where nothing resolves keys, and then a key alone is not enough. */
  reachableByKey: boolean;
  /** False while the network is off, which is the default. */
  networkOn: boolean;
}

export const federationViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instances", "reachableByKey", "networkOn"],
  properties: {
    instances: { type: "array", items: federatedInstanceSchema },
    endpointId: { type: "string" },
    reachableByKey: { type: "boolean" },
    networkOn: { type: "boolean" },
  },
} as const;

/**
 * Le istanze collegate, come le vede un **membro**.
 *
 * Il pannello di amministrazione ne mostra la chiave pubblica, quando sono
 * state viste l'ultima volta e per quale strada; qui non c'è niente di tutto
 * questo. Resta il nome che ognuna **dichiara di sé** — non verificato, mai con
 * una spunta (ADR 0020 §5) — perché serve a rispondere a una domanda sola:
 * «quando cerco nella rete, dove sto cercando?».
 *
 * Non allarga nessun confine: quei nomi arrivano già ai membri dentro il campo
 * `tramite` dei risultati di una ricerca. Collegare, bloccare e dimenticare
 * restano di chi amministra.
 */
export interface ConnectedInstanceView {
  declaredName: string;
}

export const connectedInstanceViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["declaredName"],
  properties: {
    declaredName: { type: "string" },
  },
} as const;

export const connectedInstanceListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instances"],
  properties: { instances: { type: "array", items: connectedInstanceViewSchema } },
} as const;

export interface FederationKeyRequest {
  publicKey: string;
}

export const federationKeyRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["publicKey"],
  properties: { publicKey: { type: "string", minLength: 1, maxLength: 512 } },
} as const;

export interface FederationPingResult {
  reached: boolean;
  detail: string;
  declaredName?: string;
  via?: "diretto" | "relay";
}

export const federationPingResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reached", "detail"],
  properties: {
    reached: { type: "boolean" },
    detail: { type: "string" },
    declaredName: { type: "string" },
    via: { type: "string", enum: ["diretto", "relay"] },
  },
} as const;

/**
 * The profile, and how far it reaches (ADR 0018 §«La presenza è una scelta
 * della persona»).
 *
 * Three states, narrowest first, and the narrowest is the default: nothing
 * becomes visible outside the instance because somebody did not decide.
 */
export const PRESENCE_STATES = ["non_presente", "presente_privato", "presente_pubblico"] as const;

export type Presence = (typeof PRESENCE_STATES)[number];

export interface ProfileView {
  username: string;
  displayName: string;
  bio: string;
  presence: Presence;
  /**
   * Se i follow entrano senza chiedere.
   *
   * Distinto dalla presenza: quella dice se ti si trova, questo dice che cosa
   * succede quando chi ti ha trovato preme il pulsante. Default chiuso.
   */
  openFollows: boolean;
}

export const profileViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["username", "displayName", "bio", "presence", "openFollows"],
  properties: {
    username: { type: "string" },
    displayName: { type: "string" },
    bio: { type: "string" },
    presence: { type: "string", enum: PRESENCE_STATES },
    openFollows: { type: "boolean" },
  },
} as const;

/**
 * Che rapporto ha chi guarda con la persona guardata.
 *
 * Serve a un pulsante solo, ma decide quale: seguire, aspettare, smettere, o
 * niente perché sei tu. Il calcolo sta sull'istanza e non nel browser, perché
 * la risposta dipende da una lista — quella dei follower — che il browser non
 * ha e non deve avere.
 */
export const RELAZIONI = ["sei_tu", "nessuna", "in_attesa", "seguito"] as const;

export type Relazione = (typeof RELAZIONI)[number];

/**
 * Una persona, come la vede chi apre il suo profilo.
 *
 * Distinta da `ProfileView`, che è il **proprio** profilo visto dalle
 * impostazioni: là ci sono le scelte, qui c'è la persona. Presenza e follow
 * aperti compaiono solo sul proprio, perché sono decisioni di chi le prende e
 * non fatti su di lui.
 *
 * Non c'è nessun conteggio dei post, ed è deliberato: i post di una persona si
 * dividono fra le due superfici, e un numero solo mentirebbe su tutte e due.
 */
export interface PersonView {
  username: string;
  displayName: string;
  bio: string;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  relazione: Relazione;
  /** Solo sul proprio profilo. */
  presence?: Presence;
  openFollows?: boolean;
  /**
   * Presente se la persona abita un'altra istanza.
   *
   * I conteggi e la data di ingresso non attraversano: restano a zero / vuoti,
   * e l'interfaccia non li mostra. `istanza` è il nome che quella casa dà a sé
   * stessa — dichiarato, mai verificato (ADR 0020 §5).
   */
  remoto?: { instanceKey: string; istanza: string };
  /**
   * Solo su un profilo remoto già seguito: se la prova della lettura c'è.
   * Senza, si segue ma non si leggono i post — e l'interfaccia lo dice.
   */
  leggibile?: boolean;
}

export const personViewSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "username",
    "displayName",
    "bio",
    "createdAt",
    "followerCount",
    "followingCount",
    "relazione",
  ],
  properties: {
    username: { type: "string" },
    displayName: { type: "string" },
    bio: { type: "string" },
    createdAt: { type: "string" },
    followerCount: { type: "integer", minimum: 0 },
    followingCount: { type: "integer", minimum: 0 },
    relazione: { type: "string", enum: RELAZIONI },
    presence: { type: "string", enum: PRESENCE_STATES },
    openFollows: { type: "boolean" },
    remoto: {
      type: "object",
      additionalProperties: false,
      required: ["instanceKey", "istanza"],
      properties: {
        instanceKey: { type: "string" },
        istanza: { type: "string" },
      },
    },
    leggibile: { type: "boolean" },
  },
} as const;

/** Quanto può essere lungo il nome che si mostra. Lo stesso limite dell'ingresso. */
export const DISPLAY_NAME_MAX_LENGTH = 100;

export interface UpdateProfileRequest {
  bio: string;
  presence: Presence;
  openFollows: boolean;
  /**
   * Il nome che si mostra, distinto dal nome utente.
   *
   * Lo `username` non cambia mai — è l'identità con cui una persona è
   * conosciuta qui e altrove, e rinominarla romperebbe ogni follow che la
   * nomina. Il nome visibile invece è come si vuole essere chiamati, e
   * cambiarlo non rompe niente. Assente vuol dire «lascialo com'è».
   */
  displayName?: string;
}

export const updateProfileRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["bio", "presence", "openFollows"],
  properties: {
    bio: { type: "string", maxLength: 500 },
    presence: { type: "string", enum: PRESENCE_STATES },
    openFollows: { type: "boolean" },
    displayName: { type: "string", maxLength: DISPLAY_NAME_MAX_LENGTH },
  },
} as const;

/**
 * A profile found somewhere else.
 *
 * `tramite` is the instance that answered, and it is shown rather than hidden:
 * ADR 0018 asks that a find say through whom it was found, and a name without a
 * house is not an identity. Both it and `displayName` are **declared** by that
 * instance — no check marks (ADR 0020 §5).
 */
export interface RemoteProfileHit {
  username: string;
  displayName: string;
  instanceKey: string;
  tramite: string;
}

export const remoteProfileHitSchema = {
  type: "object",
  additionalProperties: false,
  required: ["username", "displayName", "instanceKey", "tramite"],
  properties: {
    username: { type: "string" },
    displayName: { type: "string" },
    instanceKey: { type: "string" },
    tramite: { type: "string" },
  },
} as const;

/**
 * Dove si sta cercando.
 *
 * Le due modalità dell'interfaccia non cambiano solo che cosa si guarda: in
 * `istanza` **il termine di ricerca non esce di casa**, perché nessuno ha
 * chiesto che uscisse. Fino al 2026-08-20 ogni singola ricerca — anche quella
 * per trovare il vicino di sotto — partiva verso tutte le istanze collegate.
 *
 * `istanza` è il default, per la stessa ragione per cui lo è `local` fra gli
 * scope: niente esce dall'istanza per omissione.
 */
export const SEARCH_SCOPES = ["istanza", "rete"] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const SEARCH_SCOPE_PREDEFINITO: SearchScope = "istanza";

export interface ProfileSearchResult {
  /** People on this instance. */
  locali: ProfileView[];
  /**
   * People on connected instances, asked at the moment and **not archived**:
   * ADR 0018 removed the stored index on 2026-08-20 because an index row is a
   * copy that outlives the person it names.
   */
  remoti: RemoteProfileHit[];
}

export const profileSearchResultSchema = {
  type: "object",
  additionalProperties: false,
  required: ["locali", "remoti"],
  properties: {
    locali: { type: "array", items: profileViewSchema },
    remoti: { type: "array", items: remoteProfileHitSchema },
  },
} as const;

/**
 * Un follow, visto da chi amministra il proprio profilo.
 *
 * `instanceKey` c'è sempre e non è un dettaglio tecnico: un nome remoto senza
 * la casa da cui viene non è un'identità, e ADR 0022 §4 dice che quel nome lo
 * dichiara l'istanza — l'interfaccia non deve mostrarlo come verificato.
 */
export interface FollowerView {
  id: string;
  username: string;
  instanceKey: string;
  state: "in_attesa" | "accettato";
  createdAt: string;
}

export const followerViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "username", "instanceKey", "state", "createdAt"],
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    instanceKey: { type: "string" },
    state: { type: "string", enum: ["in_attesa", "accettato"] },
    createdAt: { type: "string" },
  },
} as const;

export interface FollowingView {
  id: string;
  username: string;
  instanceKey: string;
  state: "in_attesa" | "accettato";
  createdAt: string;
  /**
   * Se la prova per leggere quella persona è in mano ([ADR 0023] §2).
   *
   * Mai il segreto, che nel browser non ha niente da fare: solo se c'è. Un
   * follow accettato senza prova è una relazione vera che non apre ancora
   * niente — capita a chi era già accettato prima che le prove esistessero, e
   * si rimedia richiedendo. Sempre `true` in casa, dove non serve una prova.
   */
  leggibile: boolean;
}

export const followingViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "username", "instanceKey", "state", "createdAt", "leggibile"],
  properties: {
    id: { type: "string" },
    username: { type: "string" },
    instanceKey: { type: "string" },
    state: { type: "string", enum: ["in_attesa", "accettato"] },
    createdAt: { type: "string" },
    leggibile: { type: "boolean" },
  },
} as const;

export interface FollowsView {
  followers: FollowerView[];
  following: FollowingView[];
}

export const followsViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["followers", "following"],
  properties: {
    followers: { type: "array", items: followerViewSchema },
    following: { type: "array", items: followingViewSchema },
  },
} as const;

export interface FollowRequest {
  instanceKey: string;
  username: string;
}

export const followRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instanceKey", "username"],
  properties: {
    // «locale» per un vicino di casa: seguire qualcuno della propria istanza
    // non passa dalla rete, e non deve dipendere dal fatto che sia accesa.
    instanceKey: { type: "string", minLength: 1, maxLength: 512 },
    username: { type: "string", minLength: 1, maxLength: 120 },
  },
} as const;
