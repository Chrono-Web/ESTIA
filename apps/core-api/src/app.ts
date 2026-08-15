import path from "node:path";

import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import type { AppConfig } from "@estia/config";
import { healthResponseSchema, type HealthResponse } from "@estia/contracts";
import Fastify, { LogController, type FastifyError, type FastifyInstance } from "fastify";

import { registerAdminRoutes } from "./admin/routes.js";
import {
  SqliteAuditRepository,
  SqliteInviteRepository,
  SqliteJoinRequestRepository,
} from "./admission/repository.js";
import { registerAdmissionRoutes } from "./admission/routes.js";
import { AdmissionService } from "./admission/service.js";
import { createTransactor, openDatabase, secureDataDirectory } from "./db/database.js";
import {
  SqliteCommentRepository,
  SqliteLikeRepository,
  SqlitePostRepository,
} from "./feed/repository.js";
import { registerFeedRoutes } from "./feed/routes.js";
import { FeedService } from "./feed/service.js";
import { DomainError } from "./errors.js";
import {
  SqliteRecoveryCodeRepository,
  SqliteSessionRepository,
  SqliteUserRepository,
} from "./identity/repository.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { IdentityService } from "./identity/service.js";
import { SqliteMediaRepository } from "./media/repository.js";
import { registerMediaRoutes } from "./media/routes.js";
import { MediaService } from "./media/service.js";
import { FilesystemMediaStorage } from "./media/storage.js";
import { createSetupToken, loadOrCreateIdentity } from "./instance/identity.js";
import { SqliteInstanceRepository } from "./instance/repository.js";
import { registerInstanceRoutes } from "./instance/routes.js";
import { InstanceService } from "./instance/service.js";
import { registerWebClient, resolveWebRoot } from "./web/static.js";

declare module "fastify" {
  interface FastifyInstance {
    instanceService: InstanceService;
    identityService: IdentityService;
    admissionService: AdmissionService;
    feedService: FeedService;
    mediaService: MediaService;
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
  /**
   * Where structured logs go. Exists so that tests can assert what the
   * instance does and does not write, which is how SECURITY_BASELINE §7 stops
   * being a promise and becomes a check.
   */
  logDestination?: NodeJS.WritableStream;
  /** Where the built client lives. Resolved from the module when absent. */
  webRoot?: string;
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
            ...(options.logDestination === undefined ? {} : { stream: options.logDestination }),
          },
  });

  const database = openDatabase(config.dataDir);

  // Said out loud when it is not true. A directory that other users of the
  // machine can list is not the protection SECURITY_BASELINE §4 describes, and
  // the instance must not behave as though it were.
  if (!secureDataDirectory(config.dataDir)) {
    app.log.warn(
      { dataDir: config.dataDir, event: "data_dir_permissions_loose" },
      "La directory dei dati non è a 0700: altri utenti della stessa macchina potrebbero elencarla",
    );
  }

  const identity = loadOrCreateIdentity(config.dataDir);
  const clock = options.now === undefined ? {} : { now: options.now };

  const identityService = new IdentityService({
    ...clock,
    recoveryCodes: new SqliteRecoveryCodeRepository(database),
    sessions: new SqliteSessionRepository(database),
    users: new SqliteUserRepository(database),
  });

  const instanceService = new InstanceService({
    ...clock,
    identity: identityService,
    publicKey: identity.publicKey,
    repository: new SqliteInstanceRepository(database),
    setupToken: options.setupToken ?? createSetupToken(),
    transaction: createTransactor(database),
  });

  const admissionService = new AdmissionService({
    ...clock,
    audit: new SqliteAuditRepository(database),
    identity: identityService,
    invites: new SqliteInviteRepository(database),
    requests: new SqliteJoinRequestRepository(database),
    transaction: createTransactor(database),
  });

  const mediaService = new MediaService({
    ...clock,
    limits: config.media,
    repository: new SqliteMediaRepository(database),
    // Media live beside the database, inside the data directory: one directory
    // to back up, one to encrypt at rest (SECURITY_BASELINE §6).
    storage: new FilesystemMediaStorage(path.join(config.dataDir, "media")),
  });

  const feedService = new FeedService({
    ...clock,
    comments: new SqliteCommentRepository(database),
    likes: new SqliteLikeRepository(database),
    media: mediaService,
    posts: new SqlitePostRepository(database),
    transaction: createTransactor(database),
  });

  app.decorate("admissionService", admissionService);
  app.decorate("feedService", feedService);
  app.decorate("identityService", identityService);
  app.decorate("instanceService", instanceService);
  app.decorate("mediaService", mediaService);

  // Applied only where a route asks for it, so that adding the feed later does
  // not inherit a limit nobody chose.
  await app.register(rateLimit, { global: false });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "ESTIA Core API",
        version: "0.0.0",
      },
      openapi: "3.0.3",
    },
  });

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    if (error instanceof DomainError) {
      // The code is logged, the credential that caused it never is.
      request.log.warn({ code: error.code, event: "request_rejected" }, "Request rejected");

      return reply.status(error.status).send({ code: error.code, message: error.message });
    }

    if (error.statusCode !== undefined && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ code: error.code ?? "bad_request", message: error.message });
    }

    request.log.error({ err: error, event: "request_failed" }, "Unhandled error");

    return reply.status(500).send({ code: "internal_error", message: "Unexpected server error." });
  });

  app.get<{ Reply: HealthResponse }>("/health/live", { schema: healthRouteSchema }, async () => ({
    status: "ok",
  }));

  app.get<{ Reply: HealthResponse }>("/health/ready", { schema: healthRouteSchema }, async () => ({
    status: "ok",
  }));

  registerInstanceRoutes(app, instanceService);
  registerIdentityRoutes(app, identityService);
  registerAdminRoutes(app, { identity: identityService, instance: instanceService });
  registerAdmissionRoutes(app, { admission: admissionService, identity: identityService });
  registerFeedRoutes(app, { feed: feedService, identity: identityService });
  registerMediaRoutes(
    app,
    { identity: identityService, media: mediaService },
    { maxBytes: config.media.maxBytes },
  );

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await registerWebClient(app, options.webRoot ?? resolveWebRoot());

  app.addHook("onClose", async (instance) => {
    database.close();
    instance.log.info({ event: "core_api_stopped" }, "Core API stopped");
  });

  return app;
}
