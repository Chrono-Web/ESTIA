import {
  errorResponseSchema,
  instancePublicViewSchema,
  instanceSetupRequestSchema,
  type ErrorResponse,
  type InstancePublicView,
  type InstanceSetupRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import type { InstanceService } from "./service.js";

export function registerInstanceRoutes(app: FastifyInstance, service: InstanceService): void {
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

  app.post<{ Body: InstanceSetupRequest; Reply: InstancePublicView | ErrorResponse }>(
    "/api/v1/instance/setup",
    {
      config: {
        // Guessing the setup code must not be cheap.
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
      schema: {
        body: instanceSetupRequestSchema,
        response: {
          201: instancePublicViewSchema,
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
