import {
  connectionViewSchema,
  type ConnectionOrigin,
  type ConnectionView,
  errorResponseSchema,
  instancePublicViewSchema,
  instanceSetupRequestSchema,
  instanceSetupResponseSchema,
  type ErrorResponse,
  type InstancePublicView,
  type InstanceSetupRequest,
  type InstanceSetupResponse,
  type VerifySetupTokenRequest,
  verifySetupTokenRequestSchema,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

/**
 * What a member is arriving through, in words (M4, ADR 0004).
 *
 * SECURITY_BASELINE §1 lists the remote transport as trust boundary 4 — «terzo
 * dichiarato e sostituibile» — and declaring it means telling the people who
 * cross it, not only writing it in a document they will not read.
 */
const CONNECTION_DETAIL: Record<ConnectionOrigin, string> = {
  local: "Sei sulla stessa rete dell'istanza: nessun altro sta in mezzo.",
  loopback: "Stai guardando l'istanza dalla macchina che la ospita.",
  overlay:
    "Stai arrivando da fuori casa, attraverso la rete privata del pilot. I contenuti restano cifrati fino all'istanza, ma chi gestisce quella rete vede che ti sei collegato, quando e da dove.",
  public:
    "Stai arrivando da un indirizzo che non è né della rete di casa né della rete privata del pilot. Può voler dire che l'istanza è raggiungibile da Internet, oppure che fra te e lei c'è un proxy: chi la amministra dovrebbe controllare quale delle due.",
};

import { classifyAddress } from "./origin.js";
import type { InstanceService } from "./service.js";

export function registerInstanceRoutes(app: FastifyInstance, service: InstanceService): void {
  /**
   * Deliberately open to anyone who can reach it: it says nothing about the
   * instance, only something about the caller's own connection — which the
   * caller already knows better than we do.
   */
  app.get<{ Reply: ConnectionView }>(
    "/api/v1/connection",
    { schema: { response: { 200: connectionViewSchema }, tags: ["instance"] } },
    async (request) => {
      const origin = classifyAddress(request.ip);

      return { detail: CONNECTION_DETAIL[origin], origin };
    },
  );

  app.get<{ Reply: InstancePublicView }>(
    "/api/v1/instance",
    {
      schema: {
        response: { 200: instancePublicViewSchema },
        tags: ["instance"],
      },
    },
    async () => service.getPublicView(),
  );

  /**
   * Il codice, e nient'altro.
   *
   * Stessa limitazione di frequenza della configurazione: è un oracolo su un
   * segreto, e averlo diviso in due passi non deve renderlo più economico da
   * indovinare.
   */
  app.post<{ Body: VerifySetupTokenRequest }>(
    "/api/v1/instance/setup/verify",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        body: verifySetupTokenRequestSchema,
        response: { 403: errorResponseSchema, 409: errorResponseSchema },
        tags: ["instance"],
      },
    },
    async (request, reply) => {
      service.verifySetupToken(request.body.setupToken);

      return reply.status(204).send();
    },
  );

  app.post<{ Body: InstanceSetupRequest; Reply: InstanceSetupResponse | ErrorResponse }>(
    "/api/v1/instance/setup",
    {
      config: {
        // Guessing the setup code must not be cheap.
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        body: instanceSetupRequestSchema,
        response: {
          201: instanceSetupResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
        },
        tags: ["instance"],
      },
    },
    // Rejections surface as DomainError and are shaped by the central error
    // handler, which never echoes the submitted token.
    async (request, reply) => reply.status(201).send(await service.setup(request.body)),
  );
}
