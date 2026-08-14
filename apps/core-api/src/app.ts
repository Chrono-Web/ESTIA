import swagger from "@fastify/swagger";
import type { AppConfig } from "@estia/config";
import { healthResponseSchema, type HealthResponse } from "@estia/contracts";
import Fastify, { LogController, type FastifyInstance } from "fastify";

import { openDatabase } from "./db/database.js";
import { createSetupToken, loadOrCreateIdentity } from "./instance/identity.js";
import { SqliteInstanceRepository } from "./instance/repository.js";
import { registerInstanceRoutes } from "./instance/routes.js";
import { InstanceService } from "./instance/service.js";

declare module "fastify" {
  interface FastifyInstance {
    instanceService: InstanceService;
  }
}

const healthRouteSchema = {
  tags: ["health"],
  response: {
    200: healthResponseSchema,
  },
} as const;

export interface BuildAppOptions {
  /** Injected so the process can print it once; generated when absent. */
  setupToken?: string;
  now?: () => Date;
}

export async function buildApp(
  config: AppConfig,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
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

  const database = openDatabase(config.dataDir);
  const identity = loadOrCreateIdentity(config.dataDir);

  const service = new InstanceService({
    ...(options.now === undefined ? {} : { now: options.now }),
    publicKey: identity.publicKey,
    repository: new SqliteInstanceRepository(database),
    setupToken: options.setupToken ?? createSetupToken(),
  });

  app.decorate("instanceService", service);

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

  registerInstanceRoutes(app, service);

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  app.addHook("onClose", async (instance) => {
    database.close();
    instance.log.info({ event: "core_api_stopped" }, "Core API stopped");
  });

  return app;
}
