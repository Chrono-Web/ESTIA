import swagger from "@fastify/swagger";
import type { AppConfig } from "@estia/config";
import { healthResponseSchema, type HealthResponse } from "@estia/contracts";
import Fastify, { LogController, type FastifyInstance } from "fastify";

const healthRouteSchema = {
  tags: ["health"],
  response: {
    200: healthResponseSchema,
  },
} as const;

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logController: new LogController({
      disableRequestLogging: true,
    }),
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"],
              remove: true,
            },
          },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "ESTIA Core API",
        version: "0.0.0",
      },
      openapi: "3.0.3",
    },
  });

  app.get<{ Reply: HealthResponse }>("/health/live", { schema: healthRouteSchema }, async () => ({
    status: "ok",
  }));

  app.get<{ Reply: HealthResponse }>("/health/ready", { schema: healthRouteSchema }, async () => ({
    status: "ok",
  }));

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  app.addHook("onClose", async (instance) => {
    instance.log.info({ event: "core_api_stopped" }, "Core API stopped");
  });

  return app;
}
