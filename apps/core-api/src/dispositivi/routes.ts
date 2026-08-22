import {
  claimKeyPackageResponseSchema,
  devicePublicKeyResponseSchema,
  keyBackupViewSchema,
  publishKeyPackagesRequestSchema,
  registerDeviceKeyRequestSchema,
  registerDeviceKeyResponseSchema,
  saveKeyBackupRequestSchema,
  type ClaimKeyPackageResponse,
  type DeviceKeyView,
  type DevicePublicKeyResponse,
  type KeyBackupView,
  type PublishKeyPackagesRequest,
  type RegisterDeviceKeyRequest,
  type RegisterDeviceKeyResponse,
  type SaveKeyBackupRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { DomainError } from "../errors.js";
import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { DispositiviService } from "./service.js";

export function registerDispositiviRoutes(
  app: FastifyInstance,
  services: { dispositivi: DispositiviService; identity: IdentityService },
): void {
  const asMember = requireAuth(services.identity);

  /** Registra la chiave pubblica del dispositivo per la sessione attiva. */
  app.post<{
    Body: RegisterDeviceKeyRequest;
    Reply: RegisterDeviceKeyResponse;
  }>(
    "/api/v1/dispositivi/chiave",
    {
      preHandler: asMember,
      schema: {
        body: registerDeviceKeyRequestSchema,
        response: {
          200: registerDeviceKeyResponseSchema,
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      const device = services.dispositivi.registerKey(
        caller.user.id,
        caller.sessionId,
        request.body,
      );
      return { device };
    },
  );

  /** Restituisce la chiave del dispositivo per la sessione corrente. */
  app.get<{
    Reply: { device: DeviceKeyView | null };
  }>(
    "/api/v1/dispositivi/chiave/me",
    {
      preHandler: asMember,
    },
    async (request) => {
      const caller = request.caller!;
      const device = services.dispositivi.getCurrentDevice(caller.sessionId) ?? null;
      return { device };
    },
  );

  /** Pubblica un lotto di KeyPackage monouso per il dispositivo della sessione attiva. */
  app.post<{
    Body: PublishKeyPackagesRequest;
    Reply: { count: number };
  }>(
    "/api/v1/dispositivi/key-packages",
    {
      preHandler: asMember,
      schema: {
        body: publishKeyPackagesRequestSchema,
        response: {
          200: {
            type: "object",
            required: ["count"],
            properties: { count: { type: "integer" } },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      return services.dispositivi.publishKeyPackages(
        caller.user.id,
        caller.sessionId,
        request.body,
      );
    },
  );

  /** Preleva e consuma un KeyPackage per iniziare una conversazione con un membro. */
  app.get<{
    Params: { userId: string };
    Reply: ClaimKeyPackageResponse;
  }>(
    "/api/v1/dispositivi/key-packages/claim/:userId",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "string" } },
        },
        response: {
          200: claimKeyPackageResponseSchema,
        },
      },
    },
    async (request) => {
      const targetUserId = request.params.userId;
      const res = services.dispositivi.claimKeyPackage(targetUserId);
      if (!res) {
        throw new DomainError(
          "no_device_available",
          "The user has no registered active devices.",
          404,
        );
      }
      return res;
    },
  );

  /** Restituisce la chiave pubblica di uno specifico dispositivo per ID. */
  app.get<{
    Params: { deviceId: string };
    Reply: DevicePublicKeyResponse;
  }>(
    "/api/v1/dispositivi/:deviceId/chiave-pubblica",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["deviceId"],
          properties: { deviceId: { type: "string" } },
        },
        response: {
          200: devicePublicKeyResponseSchema,
        },
      },
    },
    async (request) => {
      const deviceId = request.params.deviceId;
      const res = services.dispositivi.getDevicePublicKey(deviceId);
      if (!res) {
        throw new DomainError("device_not_found", "Device key not found.", 404);
      }
      return res;
    },
  );

  /** Salva o aggiorna il backup cifrato delle chiavi personali. */
  app.put<{
    Body: SaveKeyBackupRequest;
    Reply: KeyBackupView;
  }>(
    "/api/v1/dispositivi/backup",
    {
      preHandler: asMember,
      schema: {
        body: saveKeyBackupRequestSchema,
        response: {
          200: keyBackupViewSchema,
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      return services.dispositivi.saveBackup(caller.user.id, request.body);
    },
  );

  /** Recupera il backup cifrato delle chiavi personali. */
  app.get<{
    Reply: KeyBackupView;
  }>(
    "/api/v1/dispositivi/backup",
    {
      preHandler: asMember,
      schema: {
        response: {
          200: keyBackupViewSchema,
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      const backup = services.dispositivi.getBackup(caller.user.id);
      if (!backup) {
        throw new DomainError("backup_not_found", "No key backup found for this user.", 404);
      }
      return backup;
    },
  );
}
