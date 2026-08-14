import { randomUUID } from "node:crypto";

import type {
  AuditEventView,
  CreateInviteResponse,
  InviteView,
  JoinRequestStatus,
  JoinRequestSubmission,
  JoinRequestView,
} from "@estia/contracts";

import type { Transactor } from "../db/database.js";
import { DomainError } from "../errors.js";
import { createReadableCode, hashCode } from "../identity/codes.js";
import { hashPassword } from "../identity/password.js";
import type { IdentityService } from "../identity/service.js";
import type {
  AuditRepository,
  InviteRecord,
  InviteRepository,
  JoinRequestRecord,
  JoinRequestRepository,
} from "./repository.js";

/** Four groups: 80 bits. Shared over a message or read aloud, not stored. */
const INVITE_GROUPS = 4;
const DEFAULT_INVITE_HOURS = 72;
const AUDIT_PAGE = 100;

export interface AdmissionServiceOptions {
  invites: InviteRepository;
  requests: JoinRequestRepository;
  audit: AuditRepository;
  identity: IdentityService;
  transaction: Transactor;
  now?: () => Date;
}

export class AdmissionService {
  private readonly invites: InviteRepository;
  private readonly requests: JoinRequestRepository;
  private readonly audit: AuditRepository;
  private readonly identity: IdentityService;
  private readonly transaction: Transactor;
  private readonly now: () => Date;

  public constructor(options: AdmissionServiceOptions) {
    this.invites = options.invites;
    this.requests = options.requests;
    this.audit = options.audit;
    this.identity = options.identity;
    this.transaction = options.transaction;
    this.now = options.now ?? ((): Date => new Date());
  }

  public createInvite(
    actorId: string,
    input: { label?: string; maxUses?: number; expiresInHours?: number },
  ): CreateInviteResponse {
    const code = createReadableCode(INVITE_GROUPS);
    const createdAt = this.now();
    const hours = input.expiresInHours ?? DEFAULT_INVITE_HOURS;

    const record: InviteRecord = {
      codeHash: hashCode(code),
      createdAt: createdAt.toISOString(),
      createdBy: actorId,
      expiresAt: new Date(createdAt.getTime() + hours * 60 * 60 * 1000).toISOString(),
      id: randomUUID(),
      label: input.label?.trim() ?? "",
      // Single use unless the administrator deliberately asks for more.
      maxUses: input.maxUses ?? 1,
      revokedAt: null,
      usedCount: 0,
    };

    this.invites.create(record);
    this.recordAudit(actorId, "invite_created", record.id);

    return { code, invite: this.toInviteView(record) };
  }

  public listInvites(): InviteView[] {
    return this.invites.list().map((invite) => this.toInviteView(invite));
  }

  public revokeInvite(actorId: string, inviteId: string): void {
    if (this.invites.findById(inviteId) === undefined) {
      throw new DomainError("invite_not_found", "No such invite.", 404);
    }

    this.invites.revoke(inviteId, this.now().toISOString());
    this.recordAudit(actorId, "invite_revoked", inviteId);
  }

  /**
   * A valid invite lets someone *ask*. It never admits them: approval is a
   * separate, explicit act (ADR 0003, requisito 3).
   */
  public async submitJoinRequest(input: JoinRequestSubmission): Promise<JoinRequestView> {
    const invite = this.invites.findByCodeHash(hashCode(input.inviteCode));
    const rejection = new DomainError("invalid_invite", "This invite is not valid.", 403);

    if (invite === undefined || !this.isInviteUsable(invite)) {
      throw rejection;
    }

    const username = input.username.trim().toLowerCase();

    // Checked here so the invitee learns immediately, and again at approval
    // where it actually matters. Only someone holding a valid invite can probe.
    if (
      !this.identity.isUsernameAvailable(username) ||
      this.requests.findPendingByUsername(username) !== undefined
    ) {
      throw new DomainError("username_taken", "This username is already in use.", 409);
    }

    const record = {
      createdAt: this.now().toISOString(),
      createdUserId: null,
      decidedAt: null,
      decidedBy: null,
      displayName: input.displayName?.trim() || username,
      id: randomUUID(),
      inviteId: invite.id,
      message: input.message?.trim() ?? "",
      // Hashed now: the administrator may decide days later, and the password
      // must never be stored in clear while it waits.
      passwordHash: await hashPassword(input.password),
      status: "pending" as const,
      username,
    };

    this.requests.create(record);

    return toRequestView(record);
  }

  public listJoinRequests(status: JoinRequestStatus): JoinRequestView[] {
    return this.requests.listByStatus(status).map(toRequestView);
  }

  public approve(actorId: string, requestId: string): JoinRequestView {
    const request = this.pendingRequest(requestId);
    const invite = this.invites.findById(request.inviteId);

    if (invite === undefined || !this.isInviteUsable(invite)) {
      throw new DomainError(
        "invite_no_longer_valid",
        "The invite behind this request is no longer valid.",
        409,
      );
    }

    const decidedAt = this.now().toISOString();

    return this.transaction(() => {
      const user = this.identity.createUserWithHash({
        displayName: request.displayName,
        passwordHash: request.passwordHash,
        role: "member",
        username: request.username,
      });

      this.requests.decide({
        createdUserId: user.id,
        decidedAt,
        decidedBy: actorId,
        id: request.id,
        status: "approved",
      });

      this.invites.consumeOne(invite.id);
      this.recordAudit(actorId, "member_admitted", request.username);

      return { ...toRequestView(request), status: "approved" as const };
    });
  }

  public reject(actorId: string, requestId: string): JoinRequestView {
    const request = this.pendingRequest(requestId);

    this.requests.decide({
      createdUserId: null,
      decidedAt: this.now().toISOString(),
      decidedBy: actorId,
      id: request.id,
      status: "rejected",
    });

    this.recordAudit(actorId, "join_request_rejected", request.username);

    return { ...toRequestView(request), status: "rejected" as const };
  }

  public listAudit(): AuditEventView[] {
    return this.audit.listRecent(AUDIT_PAGE).map((event) => ({
      action: event.action,
      actorUsername: event.actorUsername,
      createdAt: event.createdAt,
      id: event.id,
      subject: event.subject,
    }));
  }

  public recordAudit(actorId: string | null, action: string, subject: string): void {
    this.audit.record({
      action,
      actorUserId: actorId,
      createdAt: this.now().toISOString(),
      id: randomUUID(),
      subject,
    });
  }

  private pendingRequest(requestId: string): JoinRequestRecord {
    const request = this.requests.findById(requestId);

    if (request === undefined) {
      throw new DomainError("join_request_not_found", "No such request.", 404);
    }

    if (request.status !== "pending") {
      throw new DomainError(
        "join_request_already_decided",
        "This request was already decided.",
        409,
      );
    }

    return request;
  }

  private isInviteUsable(invite: InviteRecord): boolean {
    if (invite.revokedAt !== null || invite.usedCount >= invite.maxUses) {
      return false;
    }

    return new Date(invite.expiresAt).getTime() > this.now().getTime();
  }

  private toInviteView(invite: InviteRecord): InviteView {
    return {
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      id: invite.id,
      label: invite.label,
      maxUses: invite.maxUses,
      usable: this.isInviteUsable(invite),
      usedCount: invite.usedCount,
    };
  }
}

function toRequestView(record: {
  id: string;
  username: string;
  displayName: string;
  message: string;
  status: JoinRequestStatus;
  createdAt: string;
}): JoinRequestView {
  return {
    createdAt: record.createdAt,
    displayName: record.displayName,
    id: record.id,
    message: record.message,
    status: record.status,
    username: record.username,
  };
}
