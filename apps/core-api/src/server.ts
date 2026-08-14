import process from "node:process";

import { ConfigurationError, loadConfig } from "@estia/config";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { createSetupToken } from "./instance/identity.js";

/**
 * Printed to stdout rather than through the structured logger: a setup token is
 * a credential, and ARCHITECTURE §10 keeps credentials out of the logs. The
 * console is the only channel available to reach the administrator before any
 * account exists.
 */
function announceSetupToken(token: string): void {
  process.stdout.write(
    [
      "",
      "  ESTIA — questa istanza non è ancora configurata.",
      "  Apri l'istanza dal browser sulla rete locale e usa questo codice:",
      "",
      `      ${token}`,
      "",
      "  Il codice vale finché il processo resta attivo e non viene registrato nei log.",
      "",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  let config;

  try {
    config = loadConfig(process.env);
  } catch (error) {
    const message =
      error instanceof ConfigurationError
        ? error.message
        : "Unable to validate the ESTIA configuration.";

    process.stderr.write("ESTIA configuration error: " + message + "\n");
    process.exitCode = 1;
    return;
  }

  const setupToken = createSetupToken();
  let app: FastifyInstance;

  try {
    app = await buildApp(config, { setupToken });
  } catch {
    process.stderr.write("ESTIA startup error: Unable to initialize the Core API.\n");
    process.exitCode = 1;
    return;
  }

  if (app.instanceService.getPublicView().state === "unconfigured") {
    announceSetupToken(setupToken);
  }

  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    app.log.info({ event: "shutdown_requested", signal }, "Graceful shutdown requested");

    try {
      await app.close();
      process.exitCode = 0;
    } catch (error) {
      app.log.error({ err: error, event: "shutdown_failed", signal }, "Graceful shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
    app.log.info(
      {
        event: "server_started",
        host: config.host,
        port: config.port,
      },
      "Core API started",
    );
  } catch (error) {
    app.log.error({ err: error, event: "startup_failed" }, "Core API failed to start");
    await app.close();
    process.exitCode = 1;
  }
}

void main();
