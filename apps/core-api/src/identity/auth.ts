import type { UserRole } from "@estia/contracts";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

import { DomainError } from "../errors.js";
import type { AuthenticatedCaller, IdentityService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireAuth`. Absent on unauthenticated routes. */
    caller?: AuthenticatedCaller;
  }
}

const BEARER = /^Bearer (.+)$/;

function extractToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;

  if (typeof header !== "string") {
    return undefined;
  }

  return BEARER.exec(header)?.[1];
}

/**
 * Rejects anything without a live session.
 *
 * Authorisation comes from the session, never from where the request came from:
 * being on the local network is not a credential (SECURITY_BASELINE §2).
 */
export function requireAuth(service: IdentityService): preHandlerHookHandler {
  return function authenticate(request: FastifyRequest, _reply: FastifyReply, done): void {
    const token = extractToken(request);
    const caller = token === undefined ? undefined : service.authenticate(token);

    if (caller === undefined) {
      done(new DomainError("unauthenticated", "Authentication is required.", 401));
      return;
    }

    request.caller = caller;
    done();
  };
}

/** Restricts a route to an explicit set of roles. No implicit hierarchy. */
export function requireRole(...roles: readonly UserRole[]): preHandlerHookHandler {
  return function authorize(request: FastifyRequest, _reply: FastifyReply, done): void {
    const caller = request.caller;

    if (caller === undefined) {
      done(new DomainError("unauthenticated", "Authentication is required.", 401));
      return;
    }

    if (!roles.includes(caller.user.role)) {
      done(new DomainError("forbidden", "This action is not allowed for your role.", 403));
      return;
    }

    done();
  };
}
