import {
  adminDiagnosticsSchema,
  type AdminDiagnostics,
  type AtRestReport,
  type BackupReport,
  type SchemaUpgradeView,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { DurabilityReport } from "../instance/persistence.js";
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
    /**
     * The last time the schema moved forward, and whether a backup preceded it
     * (ADR 0014). Read from the database at startup, so it survives the restart
     * that follows an update: an upgrade applied without a point of return
     * still has none tomorrow.
     */
    lastUpgrade?: SchemaUpgradeView;
    /**
     * Looked at per request, unlike the two above: whether a backup landed last
     * night is exactly the kind of thing that changes while the instance runs,
     * and a value frozen at startup would answer yesterday's question.
     */
    backups: () => Promise<BackupReport>;
    /** Whether the data directory could be tightened to 0700 at startup. */
    dataDirectorySecure: boolean;
    /** Whether that directory survives the next image update at all. */
    durability: DurabilityReport;
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
      backups: await services.backups(),
      dataDirectorySecure: services.dataDirectorySecure,
      dataDurability: services.durability.durability,
      dataDurabilityDetail: services.durability.detail,
      instanceState: services.instance.getPublicView().state,
      ...(services.lastUpgrade === undefined ? {} : { lastUpgrade: services.lastUpgrade }),
      memberCount: services.identity.countUsers(),
    }),
  );
}
