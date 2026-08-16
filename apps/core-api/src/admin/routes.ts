import { adminDiagnosticsSchema, type AdminDiagnostics, type AtRestReport } from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { InstanceService } from "../instance/service.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  services: {
    identity: IdentityService;
    instance: InstanceService;
    /**
     * Computed once at startup rather than per request: the volume under an
     * instance does not change while it runs, and a restart is exactly when a
     * change to the NAS configuration would take effect (ADR 0007).
     */
    atRest: AtRestReport;
  },
): void {
  app.get<{ Reply: AdminDiagnostics }>(
    "/api/v1/admin/diagnostics",
    {
      preHandler: [requireAuth(services.identity), requireRole("instance_admin")],
      schema: { response: { 200: adminDiagnosticsSchema }, tags: ["admin"] },
    },
    async () => ({
      atRest: services.atRest,
      instanceState: services.instance.getPublicView().state,
      memberCount: services.identity.countUsers(),
    }),
  );
}
