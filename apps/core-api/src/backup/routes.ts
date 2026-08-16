import {
  backupArchiveListSchema,
  backupKeyPairResponseSchema,
  backupSettingsViewSchema,
  updateBackupSettingsSchema,
  type BackupArchiveView,
  type BackupKeyPairResponse,
  type BackupSettingsView,
  type UpdateBackupSettings,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { BackupSettingsService } from "./service.settings.js";

/**
 * Backups from the panel, without a terminal (ADR 0016).
 *
 * There is no restore route here, and its absence is the decision: a restore is
 * needed exactly when this interface cannot be reached, so a button for it
 * would work only on the days it is not wanted.
 */
export function registerBackupRoutes(
  app: FastifyInstance,
  services: { backups: BackupSettingsService; identity: IdentityService },
): void {
  const onlyAdmin = {
    preHandler: [requireAuth(services.identity), requireRole("instance_admin")],
  };

  app.get<{ Reply: BackupSettingsView }>(
    "/api/v1/admin/backups/settings",
    { ...onlyAdmin, schema: { response: { 200: backupSettingsViewSchema }, tags: ["admin"] } },
    async () => services.backups.view(),
  );

  app.put<{ Body: UpdateBackupSettings; Reply: BackupSettingsView }>(
    "/api/v1/admin/backups/settings",
    {
      ...onlyAdmin,
      schema: {
        body: updateBackupSettingsSchema,
        response: { 200: backupSettingsViewSchema },
        tags: ["admin"],
      },
    },
    async (request) => services.backups.update(request.body),
  );

  /**
   * Generating a pair is a write, not a read: it is a POST because it produces
   * a secret that exists once, and a GET would be repeatable and cacheable.
   */
  app.post<{ Reply: BackupKeyPairResponse }>(
    "/api/v1/admin/backups/keys",
    {
      ...onlyAdmin,
      // Slow on purpose is not the point here; being cheap to hammer is.
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
      schema: { response: { 200: backupKeyPairResponseSchema }, tags: ["admin"] },
    },
    async () => services.backups.createKeys(),
  );

  app.get<{ Reply: { archives: BackupArchiveView[] } }>(
    "/api/v1/admin/backups",
    { ...onlyAdmin, schema: { response: { 200: backupArchiveListSchema }, tags: ["admin"] } },
    async () => ({ archives: await services.backups.list() }),
  );

  /**
   * One backup, now. Tight limit: it reads the whole instance and encrypts it
   * in memory (ADR 0013), so it is the most expensive thing a request can ask
   * for.
   */
  app.post<{ Reply: BackupArchiveView }>(
    "/api/v1/admin/backups",
    {
      ...onlyAdmin,
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
      schema: { tags: ["admin"] },
    },
    async (_request, reply) => reply.status(201).send(await services.backups.runNow()),
  );

  /**
   * The part that matters most: an archive that stays on the NAS is not yet a
   * backup, and getting one off it used to mean `scp`.
   */
  app.get<{ Params: { name: string } }>(
    "/api/v1/admin/backups/:name",
    { ...onlyAdmin, schema: { hide: true } },
    async (request, reply) => {
      const archive = services.backups.open(request.params.name);

      return (
        reply
          .header("content-type", "application/octet-stream")
          .header("content-disposition", `attachment; filename="${archive.name}"`)
          // Encrypted bytes, but bytes from this instance all the same: nothing
          // here is for a browser to interpret.
          .header("content-security-policy", "default-src 'none'; sandbox")
          .header("x-content-type-options", "nosniff")
          .send(archive.stream)
      );
    },
  );
}
