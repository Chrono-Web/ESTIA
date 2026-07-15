export type AppLogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface AppConfig {
  host: string;
  port: number;
  logLevel: AppLogLevel;
}

export interface ConfigEnvironment {
  ESTIA_HOST?: string;
  ESTIA_PORT?: string;
  ESTIA_LOG_LEVEL?: string;
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

export function loadConfig(environment: ConfigEnvironment): AppConfig {
  return Object.freeze({
    host: parseHost(environment.ESTIA_HOST),
    port: parsePort(environment.ESTIA_PORT),
    logLevel: parseLogLevel(environment.ESTIA_LOG_LEVEL),
  });
}
