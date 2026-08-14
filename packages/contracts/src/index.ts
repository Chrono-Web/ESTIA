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

/** Public description of an instance. Safe to show to a prospective member. */
export interface InstancePublicView {
  state: InstanceState;
  /** Absent while the instance is still unconfigured. */
  name?: string;
  description?: string;
  /** Base64url-encoded Ed25519 public key. Stable for the life of the instance. */
  publicKey: string;
  memberCount: number;
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

export interface AdminDiagnostics {
  instanceState: InstanceState;
  memberCount: number;
  atRestEncryption: AtRestEncryptionState;
}

export const adminDiagnosticsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instanceState", "memberCount", "atRestEncryption"],
  properties: {
    instanceState: { type: "string", enum: ["unconfigured", "configured"] },
    memberCount: { type: "integer", minimum: 0 },
    atRestEncryption: { type: "string", enum: ["unknown", "active", "inactive"] },
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
