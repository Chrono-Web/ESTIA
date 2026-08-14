export type AppLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface AppConfig {
  host: string;
  port: number;
  logLevel: AppLogLevel;
  /** Directory that holds the database and the instance identity. */
  dataDir: string;
  media: MediaConfig;
}

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

export function loadConfig(environment: ConfigEnvironment): AppConfig {
  return Object.freeze({
    host: parseHost(environment.ESTIA_HOST),
    port: parsePort(environment.ESTIA_PORT),
    logLevel: parseLogLevel(environment.ESTIA_LOG_LEVEL),
    dataDir: parseDataDir(environment.ESTIA_DATA_DIR),
    media: Object.freeze(parseMedia(environment)),
  });
}
