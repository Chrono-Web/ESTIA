import {
  chiaviDiFirmaViewSchema,
  claimKeyPackageResponseSchema,
  devicePublicKeyResponseSchema,
  dispositiviResponseSchema,
  keyBackupViewSchema,
  publishKeyPackagesRequestSchema,
  registerDeviceKeyRequestSchema,
  registerDeviceKeyResponseSchema,
  saveKeyBackupRequestSchema,
  type ChiaviDiFirmaView,
  type ClaimKeyPackageResponse,
  type DeviceKeyView,
  type DevicePublicKeyResponse,
  type DispositiviResponse,
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
import type { FederationService } from "../federation/service.js";
import type { DispositiviService } from "./service.js";

export function registerDispositiviRoutes(
  app: FastifyInstance,
  services: {
    dispositivi: DispositiviService;
    identity: IdentityService;
    federation?: FederationService | undefined;
  },
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

  /**
   * I dispositivi di chi chiede, **quelli in attesa compresi**.
   *
   * E' da qui che una richiesta di autorizzazione si vede
   * ([ADR 0040](../../../../docs/adr/0040-un-membro-ha-piu-di-un-dispositivo.md)).
   * Porta la chiave pubblica perche' il codice da confrontare lo calcola il
   * client: e' l'unico modo perche' quel confronto voglia dire qualcosa.
   */
  app.get<{ Reply: DispositiviResponse }>(
    "/api/v1/dispositivi",
    {
      preHandler: asMember,
      schema: { response: { 200: dispositiviResponseSchema } },
    },
    async (request) => ({
      dispositivi: services.dispositivi.listUserDevices(request.caller!.user.id),
    }),
  );

  /** Dice di si' a un dispositivo che aspetta. Solo un dispositivo approvato puo'. */
  app.post<{ Params: { deviceId: string }; Reply: RegisterDeviceKeyResponse }>(
    "/api/v1/dispositivi/:deviceId/approva",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["deviceId"],
          properties: { deviceId: { type: "string" } },
        },
        response: { 200: registerDeviceKeyResponseSchema },
      },
    },
    async (request) => {
      const caller = request.caller!;
      return {
        device: services.dispositivi.approva(
          caller.user.id,
          caller.sessionId,
          request.params.deviceId,
        ),
      };
    },
  );

  /**
   * Dice di no, e lo dice fino in fondo: il dispositivo perde la chiave **e** la
   * sessione. Un «no» che lo lasciasse collegato sarebbe una domanda che
   * ricompare, e chi la rivede la terza volta la accetta per farla smettere.
   */
  app.post<{ Params: { deviceId: string }; Reply: { ok: true } }>(
    "/api/v1/dispositivi/:deviceId/rifiuta",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["deviceId"],
          properties: { deviceId: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["ok"],
            properties: { ok: { type: "boolean", const: true } },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      const { sessionId } = services.dispositivi.rifiuta(
        caller.user.id,
        caller.sessionId,
        request.params.deviceId,
      );
      services.identity.revokeSession(caller.user.id, sessionId);
      return { ok: true };
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
      if (targetUserId.startsWith("remote:")) {
        const parts = targetUserId.split(":");
        const instanceKey = parts[1];
        const username = parts.slice(2).join(":") || instanceKey;
        if (instanceKey && username && services.federation) {
          const caller = request.caller!;
          const pkgs = await services.federation.fetchChiavi(
            instanceKey,
            { nome: username, prova: "prova-chiavi" },
            { da: caller.user.username, destinatario: username },
          );
          const first = pkgs?.[0];
          if (first) {
            try {
              services.dispositivi.saveRemoteDeviceKey({
                id: first.id,
                userId: targetUserId,
                publicKey: first.blob,
              });
            } catch {
              // Ignore cache registration errors
            }

            return {
              userId: targetUserId,
              deviceId: first.id,
              keyPackage: first.blob,
              publicKey: first.blob,
            };
          }
        }
      }

      const res = services.dispositivi.claimKeyPackage(targetUserId);
      if (!res) {
        // La legge una persona, non un programmatore: `errori.ts` lato client
        // mostra i messaggi dell'istanza cosi' come sono.
        throw new DomainError(
          "no_device_available",
          "Questa persona non ha ancora un dispositivo pronto a ricevere messaggi cifrati.",
          404,
        );
      }
      return res;
    },
  );

  /** Restituisce la chiave pubblica di uno specifico dispositivo per ID. */
  /**
   * Le chiavi di firma che l'istanza riconosce per un membro.
   *
   * E' il registro su cui poggia l'`AuthenticationService` di MLS
   * ([ADR 0038](../../../../docs/adr/0038-mls-si-adotta-e-si-comincia-dal-web.md)):
   * lo spike [S4](../../../../docs/spike/S4-autenticare-chi-entra.md) ha
   * misurato che senza, chiunque ottenga un `GroupInfo` entra come chi vuole.
   *
   * Porta le chiavi e nient'altro, e non le revocate.
   */
  app.get<{ Params: { username: string }; Reply: ChiaviDiFirmaView }>(
    "/api/v1/dispositivi/di/:username/chiavi",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["username"],
          properties: { username: { type: "string" } },
        },
        response: { 200: chiaviDiFirmaViewSchema },
      },
    },
    async (request) => services.dispositivi.chiaviDiFirmaDi(request.params.username),
  );

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
