export type AppLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface AppConfig {
  host: string;
  port: number;
  logLevel: AppLogLevel;
  /** Directory that holds the database and the instance identity. */
  dataDir: string;
  media: MediaConfig;
  backup: BackupConfig;
  /**
   * What the administrator says they set up for encryption at rest (ADR 0007).
   * The instance verifies what it can and reports both; it never takes this as
   * proof of anything.
   */
  atRestEncryption: "passphrase" | "automatic" | "none" | "unspecified";
}

/**
 * Scheduled backups (ADR 0013). Absent means the instance takes none, and says
 * so at startup: an administrator who thinks backups are running when they are
 * not is worse off than one who knows they are not.
 */
export type BackupConfig =
  | { scheduled: false }
  | {
      scheduled: true;
      /** Where archives are written. Should be a volume that leaves the NAS. */
      directory: string;
      /** age public key. The private half must never be on the instance. */
      publicKey: string;
      intervalHours: number;
      /** How many archives to keep; older ones are removed after a new one lands. */
      keep: number;
    };

/**
 * Limits on media, which PROJECT_SPEC §9 requires to be configurable: an
 * administrator on a small NAS has different room than one on a tower.
 */
export interface MediaConfig {
  /** Largest upload accepted, in bytes. */
  maxBytes: number;
  /**
   * Largest upload accepted, in pixels. A separate limit because a small file
   * can expand into a very large image, which is a cheap way to exhaust memory.
   */
  maxPixels: number;
  /** How much one member may hold, originals and thumbnails together. */
  quotaBytesPerUser: number;
}

export interface ConfigEnvironment {
  ESTIA_HOST?: string;
  ESTIA_PORT?: string;
  ESTIA_LOG_LEVEL?: string;
  ESTIA_DATA_DIR?: string;
  ESTIA_MEDIA_MAX_BYTES?: string;
  ESTIA_MEDIA_MAX_PIXELS?: string;
  ESTIA_MEDIA_QUOTA_BYTES?: string;
  ESTIA_BACKUP_DIR?: string;
  ESTIA_BACKUP_PUBLIC_KEY?: string;
  ESTIA_BACKUP_INTERVAL_HOURS?: string;
  ESTIA_BACKUP_KEEP?: string;
  ESTIA_AT_REST_ENCRYPTION?: string;
}

const allowedLogLevels: ReadonlySet<AppLogLevel> = new Set([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function parseHost(value: string | undefined): string {
  const host = value ?? "0.0.0.0";

  if (host.trim().length === 0) {
    throw new ConfigurationError("ESTIA_HOST must not be empty.");
  }

  return host;
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigurationError("ESTIA_PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function parseLogLevel(value: string | undefined): AppLogLevel {
  const logLevel = value ?? "info";

  if (!allowedLogLevels.has(logLevel as AppLogLevel)) {
    throw new ConfigurationError(
      "ESTIA_LOG_LEVEL must be one of fatal, error, warn, info, debug, trace, or silent.",
    );
  }

  return logLevel as AppLogLevel;
}

function parseDataDir(value: string | undefined): string {
  const dataDir = value ?? "./.data";

  if (dataDir.trim().length === 0) {
    throw new ConfigurationError("ESTIA_DATA_DIR must not be empty.");
  }

  return dataDir;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ConfigurationError(`${name} must be an integer between 1 and ${maximum}.`);
  }

  return parsed;
}

/**
 * Defaults sized for what the browser actually sends after compressing
 * (ADR 0011): around 1600 pixels on the long side, a few hundred kilobytes.
 * The room above that is there so a direct upload from another tool still
 * works, not so that the instance becomes a photo archive.
 */
const MEDIA_DEFAULTS = {
  maxBytes: 5 * 1024 * 1024,
  maxPixels: 12_000_000,
  quotaBytesPerUser: 256 * 1024 * 1024,
} as const;

function parseMedia(environment: ConfigEnvironment): MediaConfig {
  return {
    maxBytes: parsePositiveInteger(
      environment.ESTIA_MEDIA_MAX_BYTES,
      MEDIA_DEFAULTS.maxBytes,
      "ESTIA_MEDIA_MAX_BYTES",
      64 * 1024 * 1024,
    ),
    maxPixels: parsePositiveInteger(
      environment.ESTIA_MEDIA_MAX_PIXELS,
      MEDIA_DEFAULTS.maxPixels,
      "ESTIA_MEDIA_MAX_PIXELS",
      100_000_000,
    ),
    quotaBytesPerUser: parsePositiveInteger(
      environment.ESTIA_MEDIA_QUOTA_BYTES,
      MEDIA_DEFAULTS.quotaBytesPerUser,
      "ESTIA_MEDIA_QUOTA_BYTES",
      64 * 1024 * 1024 * 1024,
    ),
  };
}

/**
 * Backups are configured or they are not; half-configured is refused at
 * startup rather than discovered the night nothing gets written.
 */
function parseBackup(environment: ConfigEnvironment): BackupConfig {
  const directory = environment.ESTIA_BACKUP_DIR?.trim() ?? "";
  const publicKey = environment.ESTIA_BACKUP_PUBLIC_KEY?.trim() ?? "";

  if (directory === "" && publicKey === "") {
    return { scheduled: false };
  }

  if (directory === "" || publicKey === "") {
    throw new ConfigurationError(
      "ESTIA_BACKUP_DIR e ESTIA_BACKUP_PUBLIC_KEY vanno impostate insieme: una sola delle due non produce backup.",
    );
  }

  // The mistake worth catching first, because it is the dangerous one and the
  // generic message would hide it: a private key pasted where the public one
  // goes puts on the instance the very secret that must stay off it.
  if (publicKey.toUpperCase().startsWith("AGE-SECRET-KEY")) {
    throw new ConfigurationError(
      "ESTIA_BACKUP_PUBLIC_KEY contiene una chiave PRIVATA. Sull'istanza va solo quella pubblica: è ciò che le impedisce di rileggere i propri backup.",
    );
  }

  // Checked here so a typo is a startup failure and not a silent no-op every
  // night. The full validation is the library's, at the first backup.
  if (!publicKey.startsWith("age1")) {
    throw new ConfigurationError(
      "ESTIA_BACKUP_PUBLIC_KEY deve essere una chiave pubblica age, che inizia con «age1».",
    );
  }

  return {
    directory,
    intervalHours: parsePositiveInteger(
      environment.ESTIA_BACKUP_INTERVAL_HOURS,
      24,
      "ESTIA_BACKUP_INTERVAL_HOURS",
      24 * 30,
    ),
    keep: parsePositiveInteger(environment.ESTIA_BACKUP_KEEP, 7, "ESTIA_BACKUP_KEEP", 365),
    publicKey,
    scheduled: true,
  };
}

const AT_REST_LEVELS = new Set(["passphrase", "automatic", "none", "unspecified"]);

/**
 * Unset means «unspecified», not «none»: an administrator who never answered
 * has not told us their data is unprotected, and the interface must not put
 * that sentence in their mouth (ADR 0007).
 */
function parseAtRest(value: string | undefined): AppConfig["atRestEncryption"] {
  const level = value?.trim() ?? "";

  if (level === "") {
    return "unspecified";
  }

  if (!AT_REST_LEVELS.has(level)) {
    throw new ConfigurationError(
      "ESTIA_AT_REST_ENCRYPTION deve essere passphrase, automatic, none o unspecified.",
    );
  }

  return level as AppConfig["atRestEncryption"];
}

/**
 * Just the data directory, for tools that work on it rather than serve it.
 *
 * The backup CLI needs this and nothing else. Making it load the whole server
 * configuration meant it also inherited the rule that `ESTIA_BACKUP_DIR` and
 * `ESTIA_BACKUP_PUBLIC_KEY` must be set together — a rule that protects an
 * instance from booting half-configured, and that has no business stopping a
 * one-off backup. The effect was backwards: the instance with no scheduled
 * backups, which is exactly the one that most needs a manual archive, was the
 * one that could not take it.
 */
export function loadDataDir(environment: ConfigEnvironment): string {
  return parseDataDir(environment.ESTIA_DATA_DIR);
}

export function loadConfig(environment: ConfigEnvironment): AppConfig {
  return Object.freeze({
    atRestEncryption: parseAtRest(environment.ESTIA_AT_REST_ENCRYPTION),
    host: parseHost(environment.ESTIA_HOST),
    port: parsePort(environment.ESTIA_PORT),
    logLevel: parseLogLevel(environment.ESTIA_LOG_LEVEL),
    dataDir: parseDataDir(environment.ESTIA_DATA_DIR),
    media: Object.freeze(parseMedia(environment)),
    backup: Object.freeze(parseBackup(environment)),
  });
}
