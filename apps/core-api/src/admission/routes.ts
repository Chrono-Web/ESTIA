import {
  auditListSchema,
  createInviteRequestSchema,
  createInviteResponseSchema,
  errorResponseSchema,
  inviteListSchema,
  joinRequestListSchema,
  joinRequestSubmissionSchema,
  joinRequestViewSchema,
  type AuditEventView,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type ErrorResponse,
  type InviteView,
  type JoinRequestStatus,
  type JoinRequestSubmission,
  type JoinRequestView,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import { joinUrlForInvite } from "./join-url.js";
import type { AdmissionService } from "./service.js";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

export function registerAdmissionRoutes(
  app: FastifyInstance,
  services: { admission: AdmissionService; identity: IdentityService },
): void {
  // Admission is the administrator's job (PRODUCT_VISION §7). Moderators deal
  // with content, not with who gets in.
  const asAdmin = [requireAuth(services.identity), requireRole("instance_admin")];

  app.post<{ Body: JoinRequestSubmission; Reply: JoinRequestView | ErrorResponse }>(
    "/api/v1/join/request",
    {
      config: {
        // Public by necessity: whoever is asking has no account yet.
        rateLimit: { max: 10, timeWindow: "10 minutes" },
      },
      schema: {
        body: joinRequestSubmissionSchema,
        response: {
          201: joinRequestViewSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
        },
        tags: ["admission"],
      },
    },
    async (request, reply) =>
      reply.status(201).send(await services.admission.submitJoinRequest(request.body)),
  );

  app.post<{ Body: CreateInviteRequest; Reply: CreateInviteResponse }>(
    "/api/v1/admin/invites",
    {
      preHandler: asAdmin,
      schema: {
        body: createInviteRequestSchema,
        response: { 201: createInviteResponseSchema },
        tags: ["admission"],
      },
    },
    async (request, reply) => {
      // The code is in the answer once, and only its hash is kept.
      const created = services.admission.createInvite(request.caller!.user.id, request.body);

      return reply.status(201).send({
        ...created,
        joinUrl: joinUrlForInvite(request, created.code),
      });
    },
  );

  app.get<{ Reply: { invites: InviteView[] } }>(
    "/api/v1/admin/invites",
    {
      preHandler: asAdmin,
      schema: { response: { 200: inviteListSchema }, tags: ["admission"] },
    },
    async () => ({ invites: services.admission.listInvites() }),
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/admin/invites/:id",
    {
      preHandler: asAdmin,
      schema: {
        params: idParamSchema,
        response: { 404: errorResponseSchema },
        tags: ["admission"],
      },
    },
    async (request, reply) => {
      services.admission.revokeInvite(request.caller!.user.id, request.params.id);

      return reply.status(204).send();
    },
  );

  app.get<{ Querystring: { status?: JoinRequestStatus }; Reply: { requests: JoinRequestView[] } }>(
    "/api/v1/admin/join-requests",
    {
      preHandler: asAdmin,
      schema: {
        querystring: {
          type: "object",
          properties: { status: { type: "string", enum: ["pending", "approved", "rejected"] } },
        },
        response: { 200: joinRequestListSchema },
        tags: ["admission"],
      },
    },
    async (request) => ({
      requests: services.admission.listJoinRequests(request.query.status ?? "pending"),
    }),
  );

  app.post<{ Params: { id: string }; Reply: JoinRequestView | ErrorResponse }>(
    "/api/v1/admin/join-requests/:id/approve",
    {
      preHandler: asAdmin,
      schema: {
        params: idParamSchema,
        response: {
          200: joinRequestViewSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        tags: ["admission"],
      },
    },
    async (request) => services.admission.approve(request.caller!.user.id, request.params.id),
  );

  app.post<{ Params: { id: string }; Reply: JoinRequestView | ErrorResponse }>(
    "/api/v1/admin/join-requests/:id/reject",
    {
      preHandler: asAdmin,
      schema: {
        params: idParamSchema,
        response: {
          200: joinRequestViewSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
        tags: ["admission"],
      },
    },
    async (request) => services.admission.reject(request.caller!.user.id, request.params.id),
  );

  app.get<{ Reply: { events: AuditEventView[] } }>(
    "/api/v1/admin/audit",
    {
      preHandler: asAdmin,
      schema: { response: { 200: auditListSchema }, tags: ["admission"] },
    },
    async () => ({ events: services.admission.listAudit() }),
  );
}
