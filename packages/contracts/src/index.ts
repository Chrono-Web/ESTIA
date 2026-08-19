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
 * `ephemeral` is the one that matters: an instance whose data lives in the
 * container's writable layer works perfectly and loses everything — including
 * the instance private key, which is not replaceable — the moment the container
 * is recreated, which is exactly what updating does.
 */
export type DataDurability = "persistent" | "ephemeral" | "unknown";

export const DATA_DURABILITIES: readonly DataDurability[] = ["persistent", "ephemeral", "unknown"];

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
  author: AuthorView;
  body: string;
  createdAt: string;
  /** True when moderation hid it; the body is emptied for everyone but its author. */
  hidden: boolean;
  /** Whether the caller may delete it. */
  canDelete: boolean;
}

export const commentViewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "postId", "author", "body", "createdAt", "hidden", "canDelete"],
  properties: {
    id: { type: "string" },
    postId: { type: "string" },
    author: authorViewSchema,
    body: { type: "string" },
    createdAt: { type: "string" },
    hidden: { type: "boolean" },
    canDelete: { type: "boolean" },
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
}

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
}

export const createCommentRequestSchema = {
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
}

export const timelinePageSchema = {
  type: "object",
  additionalProperties: false,
  required: ["posts"],
  properties: {
    posts: { type: "array", items: postViewSchema },
    nextCursor: { type: "string" },
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
}

export const createInviteResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["code", "invite"],
  properties: {
    code: { type: "string" },
    invite: inviteViewSchema,
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

export interface NetworkProbeReport {
  state: NetworkProbeState;
  /** The same thing in a sentence an administrator can act on. */
  detail: string;
  /** This instance's network identity: an ed25519 public key. */
  endpointId?: string;
  /** What another instance needs in order to reach this one. */
  ticket?: string;
  /** Whether public infrastructure is used to be found. */
  usesPublicInfrastructure?: boolean;
}

export const networkProbeReportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["state", "detail"],
  properties: {
    state: { type: "string", enum: ["off", "unavailable", "ready"] },
    detail: { type: "string" },
    endpointId: { type: "string" },
    ticket: { type: "string" },
    usesPublicInfrastructure: { type: "boolean" },
  },
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
