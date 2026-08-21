import path from "node:path";

import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import type { AppConfig } from "@estia/config";
import { dataAtRisk, healthResponseSchema, type HealthResponse } from "@estia/contracts";
import Fastify, { LogController, type FastifyError, type FastifyInstance } from "fastify";

import { registerAdminRoutes } from "./admin/routes.js";
import { readMemoryLimit } from "./backup/memory.js";
import { registerBackupRoutes } from "./backup/routes.js";
import { BackupSchedule } from "./backup/schedule.js";
import { BackupSettingsService } from "./backup/service.settings.js";
import { SqliteSettingsRepository } from "./backup/settings.js";
import { buildBackupReport } from "./backup/report.js";
import {
  SqliteAuditRepository,
  SqliteInviteRepository,
  SqliteJoinRequestRepository,
} from "./admission/repository.js";
import { registerAdmissionRoutes } from "./admission/routes.js";
import { AdmissionService } from "./admission/service.js";
import { createTransactor, secureDataDirectory } from "./db/database.js";
import { prepareDatabase } from "./db/upgrade.js";
import {
  SqliteCommentLikeRepository,
  SqliteCommentRepository,
  SqliteLikeRepository,
  SqlitePostRepository,
  SqliteRemoteLikeRepository,
} from "./feed/repository.js";
import { BachecheServite, TimelineDiRete } from "./feed/rete.js";
import { registerFeedRoutes } from "./feed/routes.js";
import { FeedService } from "./feed/service.js";
import { SqliteNotificheRepository } from "./notifiche/repository.js";
import { registerNotificheRoutes } from "./notifiche/routes.js";
import { NotificheService } from "./notifiche/service.js";
import { DomainError } from "./errors.js";
import {
  SqliteRecoveryCodeRepository,
  SqliteSessionRepository,
  SqliteUserRepository,
} from "./identity/repository.js";
import { SqliteUiPreferencesRepository } from "./identity/preferences.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { IdentityService } from "./identity/service.js";
import { SqliteMediaRepository } from "./media/repository.js";
import { registerMediaRoutes } from "./media/routes.js";
import { MediaService } from "./media/service.js";
import { FilesystemMediaStorage } from "./media/storage.js";
import {
  buildAtRestReport,
  detectAtRestEncryption,
  LINUX_ROOTS,
  type Detection,
} from "./instance/atrest.js";
import { ConnectionOriginLog } from "./instance/origin.js";
import { InstanceEndpoint } from "./federation/endpoint.js";
import { registerFederationRoutes } from "./federation/routes.js";
import { SqliteRemoteInstanceRepository } from "./federation/repository.js";
import { FederationService } from "./federation/service.js";
import { NetworkProbe } from "./network/probe.js";
import { SqliteFollowRepository } from "./profile/follows.js";
import { FollowService } from "./profile/follow-service.js";
import { SqliteProfileRepository } from "./profile/repository.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { ProfileService } from "./profile/service.js";
import { effectiveProbe, readStoredProbe, writeStoredProbe } from "./network/settings.js";
import { inspectDataDurability } from "./instance/persistence.js";
import {
  createSetupToken,
  deriveNetworkSecretKey,
  loadOrCreateIdentity,
} from "./instance/identity.js";
import { SqliteInstanceRepository } from "./instance/repository.js";
import { registerInstanceRoutes } from "./instance/routes.js";
import { InstanceService } from "./instance/service.js";
import type { DurabilityReport } from "./instance/persistence.js";
import { registerWebClient, resolveWebRoot } from "./web/static.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Owned by the app, started by the process: tests must not get timers. */
    backupSchedule: BackupSchedule;
    backupSettings: BackupSettingsService;
    instanceService: InstanceService;
    identityService: IdentityService;
    admissionService: AdmissionService;
    feedService: FeedService;
    mediaService: MediaService;
    /** Esposto come gli altri: senza, non c'è modo di verificare che una
        ricerca in casa non parta verso la rete. */
    federationService: FederationService;
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
  /**
   * Overrides what the instance observes about encryption at rest. Exists so
   * that tests can present a machine, since the real one cannot be arranged.
   */
  atRest?: Detection;
  /**
   * Overrides the container memory limit the instance reads for itself. Exists
   * so tests can present a constrained container without being run in one.
   */
  memoryLimitBytes?: number;
  /**
   * Overrides what the instance concludes about the durability of its own data.
   * Exists so tests can present a container, since the one they run in is not
   * the one under test.
   */
  durability?: DurabilityReport;
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

  // Kept so that a backup directory with nothing in it can be told apart from
  // an instance that simply booted a moment ago.
  const startedAt = options.now === undefined ? new Date() : options.now();

  // Which kinds of network reach this instance. Kept in memory and forgotten on
  // restart, and it keeps four counters rather than any address: that an
  // instance is reachable from outside is the administrator's business, from
  // which address is nobody's.
  const connections = new ConnectionOriginLog();

  app.addHook("onRequest", async (request) => {
    const origin = connections.record(
      request.ip,
      options.now === undefined ? new Date() : options.now(),
    );

    // The assumption the whole threat model rests on is that this instance is
    // not reachable from the Internet (SECURITY_BASELINE §5, «coperto per
    // costruzione»). If that stops being true, it stops quietly — unless it is
    // said. Once per kind, so a scan does not fill the log.
    //
    // Worded as an observation rather than a verdict: a port published through
    // Docker Desktop arrives from a public address with nothing exposed, so the
    // address alone does not establish a breach.
    if (origin === "public" && connections.isFirst(origin)) {
      request.log.warn(
        { event: "reached_from_outside" },
        "Una connessione è arrivata da un indirizzo né locale né della rete privata: controlla se l'istanza è esposta a Internet o se c'è un proxy davanti",
      );
    }
  });

  // Read once: a container's memory limit does not change while it runs.
  const memoryLimit = options.memoryLimitBytes ?? readMemoryLimit();

  // Before the schema moves forward, the instance backs itself up (ADR 0014).
  // Migrations are forward-only and SECURITY_BASELINE §8 makes the rollback of
  // an update the restore from a backup, so the point of return has to be
  // written before the first DDL statement — not a minute after boot, when the
  // scheduled backup would already be photographing the new schema.
  const { database, upgrade } = await prepareDatabase({
    backup: config.backup,
    dataDir: config.dataDir,
    logger: app.log,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  // Said out loud when it is not true. A directory that other users of the
  // machine can list is not the protection SECURITY_BASELINE §4 describes, and
  // the instance must not behave as though it were.
  const dataDirectorySecure = secureDataDirectory(config.dataDir);

  if (!dataDirectorySecure) {
    app.log.warn(
      { dataDir: config.dataDir, event: "data_dir_permissions_loose" },
      "La directory dei dati non è a 0700: altri utenti della stessa macchina potrebbero elencarla",
    );
  }

  // The loudest thing this instance can find out about itself: whether its own
  // data will still be there after the next update. An instance installed
  // without a volume works perfectly and loses everything on the first update.
  const durability = options.durability ?? inspectDataDurability(config.dataDir, LINUX_ROOTS);

  if (durability.durability === "ephemeral") {
    app.log.error(
      { dataDir: config.dataDir, event: "data_dir_not_persistent" },
      "I dati stanno dentro il container e non su un volume: al prossimo aggiornamento dell'immagine spariranno",
    );
  }

  // As loud as the one above, because it ends the same way. A volume nobody
  // named is carried over by `docker compose` and by nothing else, so a panel
  // that recreates the container hands the instance an empty one (ADR 0019).
  if (durability.durability === "anonymous") {
    app.log.error(
      { dataDir: config.dataDir, event: "data_dir_anonymous_volume" },
      "I dati stanno su un volume anonimo: si perdono ogni volta che il container viene ricreato senza docker compose",
    );
  }

  // Said out loud every boot, not only at setup: the escape hatch is for a
  // trial, and a trial that turned into somebody's board should be noisy.
  if (config.allowEphemeralData && dataAtRisk(durability.durability)) {
    app.log.warn(
      { dataDir: config.dataDir, event: "ephemeral_data_allowed" },
      "ESTIA_ALLOW_EPHEMERAL_DATA è attiva: l'istanza accetta di configurarsi su dati che non sopravvivranno a un aggiornamento",
    );
  }

  // Looked at once, at startup, and said out loud when it contradicts what the
  // administrator declared: an instance must never show a protection it does
  // not have (ADR 0007, requisito 2).
  const atRestReport = buildAtRestReport(
    options.atRest ?? detectAtRestEncryption(config.dataDir),
    config.atRestEncryption,
  );

  if (!atRestReport.consistent) {
    app.log.warn(
      {
        declared: atRestReport.declared,
        detected: atRestReport.detected,
        event: "at_rest_mismatch",
      },
      "La cifratura a riposo dichiarata non corrisponde a quella rilevata",
    );
  }

  const identity = loadOrCreateIdentity(config.dataDir);
  const clock = options.now === undefined ? {} : { now: options.now };

  const identityService = new IdentityService({
    ...clock,
    preferences: new SqliteUiPreferencesRepository(database),
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
    // Shown while unconfigured, when the only person looking is the one about
    // to trust this instance with a community's photographs — and, since
    // ADR 0019, what makes the instance refuse to be configured at all when
    // those photographs would not survive the next update.
    durability: durability.durability,
    allowEphemeralData: config.allowEphemeralData,
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

  // Una sola istanza del repository dei post: la serve il feed di casa, e la
  // servono le bacheche che escono verso le altre istanze (ADR 0023).
  const postRepository = new SqlitePostRepository(database);
  // I cuori arrivati da fuori: una sola istanza, perché li scrive il protocollo
  // e li legge sia il feed sia la revoca di un follower (ADR 0025 §3).
  const cuoriRemoti = new SqliteRemoteLikeRepository(database);

  const feedService = new FeedService({
    ...clock,
    comments: new SqliteCommentRepository(database),
    likes: new SqliteLikeRepository(database),
    commentLikes: new SqliteCommentLikeRepository(database),
    media: mediaService,
    posts: postRepository,
    transaction: createTransactor(database),
  });

  // Settings live in the database and the environment wins over them
  // (ADR 0016). The schedule is built here so that a change from the panel can
  // re-arm it, and started by the process so that no test ends up with a
  // backup running behind it.
  const backupSchedule = new BackupSchedule(
    { dataDir: config.dataDir, logger: app.log },
    config.backup,
  );

  // Una sola tabella di impostazioni, condivisa da chi ne ha bisogno.
  const settingsRepository = new SqliteSettingsRepository(database);

  const backupSettings = new BackupSettingsService({
    dataDir: config.dataDir,
    environment: config.backup,
    repository: settingsRepository,
    schedule: backupSchedule,
    ...clock,
  });

  backupSchedule.configure(backupSettings.resolve().config);

  app.decorate("backupSchedule", backupSchedule);
  app.decorate("backupSettings", backupSettings);
  app.decorate("admissionService", admissionService);
  app.decorate("feedService", feedService);
  app.decorate("identityService", identityService);
  app.decorate("instanceService", instanceService);
  app.decorate("mediaService", mediaService);

  // A ceiling over everything, with the tighter per-route limits keeping their
  // own numbers.
  //
  // It used to be `global: false`, so that a new route would not inherit a
  // limit nobody chose. The reasoning was sound for the shape of the routes at
  // the time and wrong for the threat model: SECURITY_BASELINE §2 says a home
  // network is not a trusted network — a compromised television is an attacker
  // on it — and «no limit unless someone remembered» leaves whatever nobody
  // remembered wide open. A default that only a deliberate route can loosen is
  // the safer direction to be wrong in.
  //
  // 600 a minute is far above any real client: a page of twenty posts with four
  // images each is eighty requests, once.
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
    // Liveness must not depend on the limiter. A container whose health check
    // starts failing gets restarted, which would turn a burst of traffic into
    // an outage.
    allowList: (request) => request.url.startsWith("/health/"),
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

  // The measurement rig of ADR 0018. Off unless asked for, and its start-up
  // can only produce a sentence in the diagnostics: a compiled module that
  // fails to load must never be able to stop an instance from booting.
  //
  // The setting lives in the panel and survives a restart, with the same rule
  // as the backups (ADR 0016): where the environment carries it, the panel
  // shows the value and refuses the edit instead of losing it at the next boot.
  //
  // Its network identity is derived from the instance key rather than drawn at
  // bind time, so it is the same key after a restart, after an image update and
  // after a restore from backup: whoever saved this instance's endpoint id
  // keeps being able to reach it.
  //
  // One key, one socket: the probe and the protocol of ADR 0021 share the
  // endpoint and are told apart by ALPN. Two endpoints on the same key would
  // publish one identity at two addresses, and a remote instance resolving that
  // key could land on the socket that does not speak what it wanted.
  const endpoint = new InstanceEndpoint(deriveNetworkSecretKey(identity));
  const networkProbe = new NetworkProbe(endpoint);
  const profileRepository = new SqliteProfileRepository(database);
  const clockOption =
    options.now === undefined ? {} : { now: () => new Date(options.now?.() ?? Date.now()) };

  const profileService = new ProfileService({ profiles: profileRepository, ...clockOption });

  // Il follow ha bisogno della federazione per uscire, e la federazione ha
  // bisogno del follow per sapere chi è «in contatto» (ADR 0022 §1). Si
  // costruisce la seconda e le si consegna il primo appena esiste.
  const federation = new FederationService({
    endpoint,
    profiles: profileService,
    // Read per call, never cached: an instance that is renamed introduces
    // itself with the new name from the next request, not the next restart.
    // Before setup there is no name, and «senza nome» is honest — a blank one
    // would look like a bug on the far side.
    instanceName: () => instanceService.getPublicView().name ?? "senza nome",
    remotes: new SqliteRemoteInstanceRepository(database),
    ...(options.now === undefined ? {} : { now: () => new Date(options.now?.() ?? Date.now()) }),
  });

  const followRepository = new SqliteFollowRepository(database);

  const followService = new FollowService({
    cuori: cuoriRemoti,
    federation,
    follows: followRepository,
    profiles: profileRepository,
    selfKey: () => endpoint.endpointId,
    ...clockOption,
  });

  federation.useFollows(followService);

  // I contenuti che attraversano, nelle due direzioni (ADR 0023). Quello che
  // esce passa dalla prova della coppia; quello che entra si compone con il
  // feed di casa in un elenco solo, e nessuna delle due sorgenti conserva
  // niente dell'altra.
  federation.useBoards(
    new BachecheServite({
      cuori: cuoriRemoti,
      follows: followRepository,
      media: mediaService,
      posts: postRepository,
      profiles: profileRepository,
    }),
  );

  const timelineDiRete = new TimelineDiRete({
    follows: followRepository,
    locale: (input) =>
      feedService.timeline(input.caller, {
        feed: "seguiti",
        limit: input.limit,
        ...(input.atOrBefore === undefined ? {} : { atOrBefore: input.atOrBefore }),
      }).posts,
    nomi: { nomeDi: (key) => federation.nomeDi(key) },
    rete: federation,
  });
  // Le notifiche non hanno una tabella propria e non ne avranno (ADR 0025 §4):
  // leggono le sei sorgenti che contengono già i fatti, e l'unica cosa che
  // scrivono è fin dove una persona ha guardato.
  const notificheService = new NotificheService({
    nomi: { nomeDi: (key) => federation.nomeDi(key) },
    notifiche: new SqliteNotificheRepository(database),
    ...clockOption,
  });

  app.decorate("federationService", federation);

  endpoint.register(networkProbe);
  endpoint.register(federation);
  const startingProbe = effectiveProbe({
    environment: config.network,
    stored: readStoredProbe(settingsRepository),
  });

  await networkProbe.apply(startingProbe.mode, { editable: !startingProbe.fromEnvironment });

  const networkReport = networkProbe.report();

  if (networkReport.state === "unavailable") {
    app.log.warn({ event: "network_probe_unavailable" }, networkReport.detail);
  } else if (networkReport.state === "ready") {
    app.log.info(
      { event: "network_probe_ready", endpointId: networkReport.endpointId },
      networkReport.detail,
    );
  }

  registerFederationRoutes(app, { endpoint, federation, identity: identityService });
  registerProfileRoutes(
    app,
    {
      federation,
      feed: feedService,
      follows: followService,
      identity: identityService,
      profiles: profileService,
      rete: timelineDiRete,
    },
    { maxBytes: config.media.maxBytes },
  );
  registerInstanceRoutes(app, instanceService);
  registerIdentityRoutes(app, identityService);
  registerAdminRoutes(app, {
    atRest: atRestReport,
    backups: () =>
      buildBackupReport({
        config: backupSettings.resolve().config,
        memoryLimitBytes: memoryLimit,
        startedAt,
        storedBytes: () => mediaService.bytesStored(),
        ...(options.now === undefined ? {} : { now: options.now }),
      }),
    connections: () => connections.summary(),
    network: {
      probe: async (ticket) => networkProbe.probe(ticket),
      report: () => networkProbe.report(),
      update: async (mode) => {
        if (config.network.probe !== "off") {
          throw new DomainError(
            "network_probe_from_environment",
            "La prova di rete è impostata da ESTIA_NETWORK_PROBE: cambiarla da qui durerebbe fino al prossimo riavvio, quindi non si cambia da qui.",
            409,
          );
        }

        await networkProbe.apply(mode);
        writeStoredProbe(settingsRepository, mode, new Date().toISOString());

        return networkProbe.report();
      },
    },
    dataDirectorySecure,
    durability,
    identity: identityService,
    instance: instanceService,
    gitSha: config.gitSha,
    ...(upgrade === undefined ? {} : { lastUpgrade: upgrade }),
  });
  registerBackupRoutes(app, { backups: backupSettings, identity: identityService });
  registerAdmissionRoutes(app, { admission: admissionService, identity: identityService });
  registerFeedRoutes(app, {
    feed: feedService,
    identity: identityService,
    rete: timelineDiRete,
  });
  registerNotificheRoutes(app, { identity: identityService, notifiche: notificheService });
  registerMediaRoutes(
    app,
    { identity: identityService, media: mediaService },
    { maxBytes: config.media.maxBytes },
  );

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  await registerWebClient(app, options.webRoot ?? resolveWebRoot());

  app.addHook("onClose", async (instance) => {
    backupSchedule.stop();
    await networkProbe.close();
    database.close();
    instance.log.info({ event: "core_api_stopped" }, "Core API stopped");
  });

  return app;
}
