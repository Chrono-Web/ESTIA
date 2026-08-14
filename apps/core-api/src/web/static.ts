import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply } from "fastify";

/**
 * Built client, written here by the web build (ADR 0010). Resolved from this
 * module rather than from the working directory, so it is found the same way
 * whether the instance runs from a checkout or from the container image.
 */
export function resolveWebRoot(): string {
  return fileURLToPath(new URL("../../public/", import.meta.url));
}

/**
 * The instance serves the interface and the API from the same origin, so a
 * flaw in the static serving is a flaw in the instance. The policy below is
 * the counterweight: nothing loads from anywhere else, and nothing inline
 * executes — which is also what keeps a session token in the browser out of
 * reach of an injected script.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // `blob:` is not an external source: only code already running in the page
  // can create one, and it is how an image fetched with the session token is
  // shown without ever putting that token in a URL (ADR 0012).
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function applySecurityHeaders(reply: FastifyReply): void {
  // A route that declared a stricter policy of its own keeps it: media are
  // served under `default-src 'none'; sandbox`, which this must not loosen.
  if (!reply.hasHeader("content-security-policy")) {
    void reply.header("content-security-policy", CONTENT_SECURITY_POLICY);
  }

  void reply.header("x-content-type-options", "nosniff");
  void reply.header("referrer-policy", "no-referrer");
  void reply.header("x-frame-options", "DENY");
}

export async function registerWebClient(app: FastifyInstance, webRoot: string): Promise<void> {
  if (!existsSync(webRoot)) {
    // The API is fully usable without the client; a missing build is a
    // development state, not a failure worth refusing to start over.
    app.log.warn(
      { event: "web_client_missing", webRoot },
      "Client web non compilato: l'istanza serve solo le API",
    );

    return;
  }

  await app.register(fastifyStatic, { index: ["index.html"], prefix: "/", root: webRoot });

  app.addHook("onSend", async (_request, reply, payload) => {
    applySecurityHeaders(reply);

    return payload;
  });

  // Routing lives in the browser, so an unknown path is a client route — but
  // only for page loads. An unknown API path stays a JSON 404.
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== "GET" || request.url.startsWith("/api/")) {
      return reply.status(404).send({ code: "not_found", message: "Risorsa non trovata." });
    }

    return reply.sendFile("index.html");
  });
}
