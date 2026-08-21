import { randomBytes, randomUUID } from "node:crypto";

import { DISPLAY_NAME_MAX_LENGTH } from "@estia/contracts";
import type {
  AuthenticatedUser,
  LoginResponse,
  SessionView,
  UiPreferences,
  UserRole,
} from "@estia/contracts";

import { DomainError } from "../errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { UiPreferencesRepository } from "./preferences.js";
import { createRecoveryCode, hashRecoveryCode } from "./recovery.js";
import type {
  RecoveryCodeRepository,
  SessionRecord,
  SessionRepository,
  UserRecord,
  UserRepository,
} from "./repository.js";
import { createSessionToken, hashSessionToken, secretsMatch } from "./tokens.js";

/** Sessions are long-lived by design: revocation, not expiry, is the control. */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A hash of an unguessable value, verified against when no account matches, so
 * that a login for an unknown username costs the same as one for a known
 * username with the wrong password. Without it the response time tells an
 * attacker which usernames exist.
 */
let decoyHash: Promise<string> | undefined;

function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return decoyHash;
}

export interface AuthenticatedCaller {
  user: AuthenticatedUser;
  sessionId: string;
}

export interface IdentityServiceOptions {
  users: UserRepository;
  sessions: SessionRepository;
  recoveryCodes: RecoveryCodeRepository;
  preferences: UiPreferencesRepository;
  now?: () => Date;
}

export class IdentityService {
  private readonly users: UserRepository;
  private readonly sessions: SessionRepository;
  private readonly recoveryCodes: RecoveryCodeRepository;
  private readonly preferences: UiPreferencesRepository;
  private readonly now: () => Date;

  public constructor(options: IdentityServiceOptions) {
    this.users = options.users;
    this.sessions = options.sessions;
    this.recoveryCodes = options.recoveryCodes;
    this.preferences = options.preferences;
    this.now = options.now ?? ((): Date => new Date());
  }

  /**
   * Issues a recovery code, returning it in clear **once**. Only its hash is
   * stored, so this value cannot be produced again (ADR 0009).
   */
  public issueRecoveryCode(userId: string): string {
    const code = createRecoveryCode();
    const issuedAt = this.now().toISOString();

    this.recoveryCodes.replaceActive(
      {
        codeHash: hashRecoveryCode(code),
        createdAt: issuedAt,
        id: randomUUID(),
        userId,
        usedAt: null,
      },
      issuedAt,
    );

    return code;
  }

  /**
   * Sets a new password against a recovery code, spends the code, closes every
   * open session and hands back a fresh code — so an account is never left
   * without a way back in.
   */
  public async recoverAccess(input: {
    username: string;
    recoveryCode: string;
    newPassword: string;
  }): Promise<{ recoveryCode: string; revokedSessions: number }> {
    const username = input.username.trim().toLowerCase();
    const user = this.users.findByUsername(username);
    const rejection = new DomainError(
      "invalid_recovery_code",
      "Username or recovery code is not valid.",
      401,
    );

    if (user === undefined || user.deletedAt !== null) {
      throw rejection;
    }

    const active = this.recoveryCodes.findActiveForUser(user.id);

    // Constant-time on the hash, and the same rejection either way, so a
    // caller cannot tell a wrong code from an unknown account.
    if (
      active === undefined ||
      !secretsMatch(active.codeHash, hashRecoveryCode(input.recoveryCode))
    ) {
      throw rejection;
    }

    const usedAt = this.now().toISOString();

    this.users.updatePasswordHash(user.id, await hashPassword(input.newPassword));
    this.recoveryCodes.markUsed(active.id, usedAt);

    // Whoever had to recover may have been compromised: nothing stays open.
    const revokedSessions = this.sessions.revokeAllForUser(user.id, usedAt);

    return { recoveryCode: this.issueRecoveryCode(user.id), revokedSessions };
  }

  /**
   * Cambia il nome che una persona mostra.
   *
   * Lo `username` non si tocca, e la differenza è sostanziale: quello è
   * l'identità con cui è conosciuta qui e — per un follow che attraversa le
   * istanze — anche altrove, quindi rinominarlo romperebbe ogni riga che la
   * nomina. Il nome visibile invece non lo usa nessun'altra tabella.
   *
   * Un nome vuoto non è un nome: si rifiuta invece di salvare una riga che poi
   * l'interfaccia dovrebbe fingere di saper mostrare.
   */
  public rename(userId: string, displayName: string): void {
    const nome = displayName.trim();

    if (nome.length === 0) {
      throw new DomainError("nome_vuoto", "Il nome da mostrare non può essere vuoto.", 400);
    }

    if (nome.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new DomainError(
        "nome_troppo_lungo",
        `Il nome da mostrare non può superare ${String(DISPLAY_NAME_MAX_LENGTH)} caratteri.`,
        400,
      );
    }

    this.users.updateDisplayName(userId, nome);
  }

  /**
   * Builds a user record, doing the expensive hashing outside any transaction.
   * Split from `persistUser` so that a caller can group the insert with other
   * writes that must succeed or fail together.
   */
  public async prepareUser(input: {
    username: string;
    password: string;
    displayName?: string;
    role: UserRole;
  }): Promise<UserRecord> {
    const username = input.username.trim().toLowerCase();

    if (this.users.findByUsername(username) !== undefined) {
      throw new DomainError("username_taken", "This username is already in use.", 409);
    }

    return {
      createdAt: this.now().toISOString(),
      deletedAt: null,
      displayName: input.displayName?.trim() || username,
      // Opaque identifier: the username is unique, but it is never the identity.
      id: randomUUID(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      username,
    };
  }

  public persistUser(record: UserRecord): void {
    this.users.create(record);
  }

  /**
   * Creates an account from a password hashed earlier — the admission flow
   * hashes at request time, long before an administrator decides. Synchronous
   * on purpose, so the caller can group it with the other writes an approval
   * has to make.
   */
  public createUserWithHash(input: {
    username: string;
    displayName: string;
    passwordHash: string;
    role: UserRole;
  }): UserRecord {
    const username = input.username.trim().toLowerCase();

    if (this.users.findByUsername(username) !== undefined) {
      throw new DomainError("username_taken", "This username is already in use.", 409);
    }

    const record: UserRecord = {
      createdAt: this.now().toISOString(),
      deletedAt: null,
      displayName: input.displayName.trim() || username,
      id: randomUUID(),
      passwordHash: input.passwordHash,
      role: input.role,
      username,
    };

    this.users.create(record);

    return record;
  }

  public isUsernameAvailable(username: string): boolean {
    return this.users.findByUsername(username.trim().toLowerCase()) === undefined;
  }

  public async createUser(input: {
    username: string;
    password: string;
    displayName?: string;
    role: UserRole;
  }): Promise<UserRecord> {
    const record = await this.prepareUser(input);
    this.persistUser(record);

    return record;
  }

  public async login(input: {
    username: string;
    password: string;
    deviceLabel?: string;
  }): Promise<LoginResponse> {
    const username = input.username.trim().toLowerCase();
    const user = this.users.findByUsername(username);
    const rejection = new DomainError(
      "invalid_credentials",
      "Username or password is not valid.",
      401,
    );

    if (user === undefined || user.deletedAt !== null) {
      // Verify against a decoy so an unknown username costs the same as a
      // known one with the wrong password.
      await verifyPassword(input.password, await getDecoyHash());
      throw rejection;
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      throw rejection;
    }

    const token = createSessionToken();
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + SESSION_LIFETIME_MS);

    this.sessions.create({
      createdAt: issuedAt.toISOString(),
      deviceLabel: input.deviceLabel?.trim() ?? "",
      expiresAt: expiresAt.toISOString(),
      id: randomUUID(),
      lastSeenAt: issuedAt.toISOString(),
      revokedAt: null,
      tokenHash: hashSessionToken(token),
      userId: user.id,
    });

    return { expiresAt: expiresAt.toISOString(), token, user: this.toAuthenticatedUser(user) };
  }

  /** Resolves a bearer token to a caller, or undefined if it grants nothing. */
  public authenticate(token: string): AuthenticatedCaller | undefined {
    const session = this.sessions.findByTokenHash(hashSessionToken(token));

    if (session === undefined || !this.isSessionUsable(session)) {
      return undefined;
    }

    const user = this.users.findById(session.userId);

    if (user === undefined || user.deletedAt !== null) {
      return undefined;
    }

    this.sessions.touch(session.id, this.now().toISOString());

    return { sessionId: session.id, user: this.toAuthenticatedUser(user) };
  }

  /** Preferenze UI della persona (ADR 0024). Catalogo chiuso: lo schema rifiuta il resto. */
  public setAppearance(userId: string, preferences: UiPreferences): UiPreferences {
    this.preferences.upsert(userId, preferences, this.now().toISOString());

    return preferences;
  }

  public listSessions(userId: string, currentSessionId: string): SessionView[] {
    return this.sessions
      .listForUser(userId)
      .filter((session) => this.isSessionUsable(session))
      .map((session) => ({
        createdAt: session.createdAt,
        current: session.id === currentSessionId,
        deviceLabel: session.deviceLabel,
        expiresAt: session.expiresAt,
        id: session.id,
        lastSeenAt: session.lastSeenAt,
      }));
  }

  /** Revokes one session. A caller may only revoke a session that is theirs. */
  public revokeSession(userId: string, sessionId: string): void {
    const session = this.sessions.findForUser(userId, sessionId);

    if (session === undefined) {
      throw new DomainError("session_not_found", "No such session.", 404);
    }

    this.sessions.revoke(sessionId, this.now().toISOString());
  }

  public revokeAllSessions(userId: string): number {
    return this.sessions.revokeAllForUser(userId, this.now().toISOString());
  }

  public countUsers(): number {
    return this.users.countActive();
  }

  private isSessionUsable(session: SessionRecord): boolean {
    if (session.revokedAt !== null) {
      return false;
    }

    return new Date(session.expiresAt).getTime() > this.now().getTime();
  }

  private toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
    return {
      appearance: this.preferences.get(user.id),
      displayName: user.displayName,
      id: user.id,
      role: user.role,
      username: user.username,
    };
  }
}

/** Solo identità, senza preferenze: utile dove l'aspetto non c'entra. */
export function toPublicUser(user: UserRecord): Omit<AuthenticatedUser, "appearance"> {
  return {
    displayName: user.displayName,
    id: user.id,
    role: user.role,
    username: user.username,
  };
}
