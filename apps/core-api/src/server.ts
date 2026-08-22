import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { ConfigurationError, loadConfig } from "@estia/config";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { createSetupToken } from "./instance/identity.js";

function getOrGenerateTls(dataDir: string): { key: string; cert: string } | undefined {
  try {
    const tlsDir = path.join(dataDir, "tls");
    if (!fs.existsSync(tlsDir)) {
      fs.mkdirSync(tlsDir, { recursive: true });
    }
    const keyPath = path.join(tlsDir, "key.pem");
    const certPath = path.join(tlsDir, "cert.pem");

    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
      process.stdout.write("Generazione certificato HTTPS autofirmato in corso...\n");
      execSync(
        `openssl req -nodes -new -x509 -keyout "${keyPath}" -out "${certPath}" -days 3650 -subj "/CN=estia.local"`,
      );
    }

    const key = fs.readFileSync(keyPath, "utf-8");
    const cert = fs.readFileSync(certPath, "utf-8");
    return { key, cert };
  } catch (err) {
    process.stderr.write(
      "Impossibile generare i certificati TLS. Il server partirà in HTTP puro se permesso.\n"
    );
    return undefined;
  }
}

/** Hourly: an orphaned upload is a cost, not an emergency. */
const ORPHAN_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

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

  const https = getOrGenerateTls(config.dataDir);
  const options: any = { setupToken };
  if (https) options.https = https;

  try {
    app = await buildApp(config, options);
  } catch {
    process.stderr.write("ESTIA startup error: Unable to initialize the Core API.\n");
    process.exitCode = 1;
    return;
  }

  if (app.instanceService.getPublicView().state === "unconfigured") {
    announceSetupToken(setupToken);
  }

  // Uploads that never became a post are collected here rather than inside the
  // app: it is a running process that needs a sweep, not a built instance, and
  // tests must not have a timer running behind them.
  const sweep = setInterval(() => {
    void app.mediaService
      .sweepOrphans()
      .then((collected) => {
        if (collected > 0) {
          app.log.info({ collected, event: "media_orphans_swept" }, "Orphaned uploads removed");
        }
      })
      .catch((error: unknown) => {
        app.log.warn({ err: error, event: "media_sweep_failed" }, "Orphan sweep failed");
      });
  }, ORPHAN_SWEEP_INTERVAL_MS);

  sweep.unref();

  // Backups belong to the running process for the same reason: an
  // administrator should not have to learn their NAS's task scheduler
  // (ADR 0013). The schedule itself is built by the app, which can re-arm it
  // when the settings change from the panel (ADR 0016); only a real process
  // starts its timers.
  app.backupSchedule.start();

  app.addHook("onClose", async () => {
    clearInterval(sweep);
  });

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
