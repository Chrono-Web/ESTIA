import {
  authenticatedUserSchema,
  errorResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  recoveryRequestSchema,
  recoveryResponseSchema,
  sessionListSchema,
  uiPreferencesSchema,
  type AuthenticatedUser,
  type ErrorResponse,
  type LoginRequest,
  type LoginResponse,
  type RecoveryRequest,
  type RecoveryResponse,
  type SessionView,
  type UiPreferences,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth } from "./auth.js";
import type { IdentityService } from "./service.js";

export function registerIdentityRoutes(app: FastifyInstance, service: IdentityService): void {
  const authenticated = requireAuth(service);

  app.post<{ Body: LoginRequest; Reply: LoginResponse | ErrorResponse }>(
    "/api/v1/auth/login",
    {
      config: {
        // Sensitive endpoint: slow down credential stuffing without locking
        // legitimate members out of their own instance.
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        body: loginRequestSchema,
        response: { 200: loginResponseSchema, 401: errorResponseSchema },
        tags: ["identity"],
      },
    },
    async (request) => service.login(request.body),
  );

  app.post<{ Body: RecoveryRequest; Reply: RecoveryResponse | ErrorResponse }>(
    "/api/v1/auth/recover",
    {
      config: {
        // Tighter than login: a recovery code is the last line of defence.
        rateLimit: { max: 5, timeWindow: "10 minutes" },
      },
      schema: {
        body: recoveryRequestSchema,
        response: { 200: recoveryResponseSchema, 401: errorResponseSchema },
        tags: ["identity"],
      },
    },
    async (request) => service.recoverAccess(request.body),
  );

  app.get<{ Reply: AuthenticatedUser }>(
    "/api/v1/auth/me",
    {
      preHandler: authenticated,
      schema: { response: { 200: authenticatedUserSchema }, tags: ["identity"] },
    },
    // `caller` is guaranteed by requireAuth.
    async (request) => request.caller!.user,
  );

  app.put<{ Body: UiPreferences; Reply: UiPreferences }>(
    "/api/v1/me/appearance",
    {
      preHandler: authenticated,
      schema: {
        body: uiPreferencesSchema,
        response: { 200: uiPreferencesSchema },
        tags: ["identity"],
      },
    },
    async (request) => service.setAppearance(request.caller!.user.id, request.body),
  );

  app.post(
    "/api/v1/auth/logout",
    { preHandler: authenticated, schema: { tags: ["identity"] } },
    async (request, reply) => {
      const caller = request.caller!;
      service.revokeSession(caller.user.id, caller.sessionId);

      return reply.status(204).send();
    },
  );

  app.get<{ Reply: { sessions: SessionView[] } }>(
    "/api/v1/auth/sessions",
    {
      preHandler: authenticated,
      schema: { response: { 200: sessionListSchema }, tags: ["identity"] },
    },
    async (request) => {
      const caller = request.caller!;

      return { sessions: service.listSessions(caller.user.id, caller.sessionId) };
    },
  );

  app.delete<{ Params: { sessionId: string } }>(
    "/api/v1/auth/sessions/:sessionId",
    {
      preHandler: authenticated,
      schema: {
        params: {
          type: "object",
          required: ["sessionId"],
          properties: { sessionId: { type: "string" } },
        },
        response: { 404: errorResponseSchema },
        tags: ["identity"],
      },
    },
    async (request, reply) => {
      const caller = request.caller!;
      // Scoped to the caller: one member can never revoke another's session.
      service.revokeSession(caller.user.id, request.params.sessionId);

      return reply.status(204).send();
    },
  );
}
