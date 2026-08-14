import { adminDiagnosticsSchema, type AdminDiagnostics } from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { InstanceService } from "../instance/service.js";

export function registerAdminRoutes(
  app: FastifyInstance,
  services: { identity: IdentityService; instance: InstanceService },
): void {
  app.get<{ Reply: AdminDiagnostics }>(
    "/api/v1/admin/diagnostics",
    {
      preHandler: [requireAuth(services.identity), requireRole("instance_admin")],
      schema: { response: { 200: adminDiagnosticsSchema }, tags: ["admin"] },
    },
    async () => ({
      // Detection is platform-specific and lands with the guided installation
      // in M3. Until then the honest answer is that we do not know, never a
      // reassuring guess (ADR 0007).
      atRestEncryption: "unknown",
      instanceState: services.instance.getPublicView().state,
      memberCount: services.identity.countUsers(),
    }),
  );
}
