import {
  errorResponseSchema,
  instancePublicViewSchema,
  instanceSetupRequestSchema,
  type ErrorResponse,
  type InstancePublicView,
  type InstanceSetupRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { DomainError, type InstanceService } from "./service.js";

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
    async (request, reply) => {
      try {
        const view = service.setup(request.body);
        return await reply.status(201).send(view);
      } catch (error) {
        if (error instanceof DomainError) {
          // The token itself is never echoed back, in any branch.
          request.log.warn(
            { code: error.code, event: "instance_setup_rejected" },
            "Instance setup rejected",
          );

          return await reply
            .status(error.status)
            .send({ code: error.code, message: error.message });
        }

        throw error;
      }
    },
  );
}
