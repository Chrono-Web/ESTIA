import {
  errorResponseSchema,
  mediaViewSchema,
  type ErrorResponse,
  type MediaView,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { MediaService } from "./service.js";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

/**
 * An image is uploaded as the body of one request, with no multipart wrapper:
 * one file per request, read as bytes, with Fastify enforcing the size limit
 * before the handler sees anything. What the header claims the type is has no
 * effect — the format is read from the content (ADR 0011).
 */
const ACCEPTED_UPLOAD_TYPES = ["application/octet-stream", "image/jpeg", "image/png", "image/webp"];

export function registerMediaRoutes(
  app: FastifyInstance,
  services: { media: MediaService; identity: IdentityService },
  limits: { maxBytes: number },
): void {
  const asMember = requireAuth(services.identity);

  for (const contentType of ACCEPTED_UPLOAD_TYPES) {
    app.addContentTypeParser(
      contentType,
      { bodyLimit: limits.maxBytes, parseAs: "buffer" },
      (_request, body, done) => {
        done(null, body);
      },
    );
  }

  app.post<{ Reply: MediaView | ErrorResponse }>(
    "/api/v1/media",
    {
      preHandler: asMember,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        response: {
          201: mediaViewSchema,
          400: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
        tags: ["media"],
      },
    },
    async (request, reply) => {
      const body: unknown = request.body;

      if (!Buffer.isBuffer(body) || body.byteLength === 0) {
        return reply
          .status(400)
          .send({ code: "empty_upload", message: "Il corpo della richiesta è vuoto." });
      }

      return reply.status(201).send(await services.media.upload(request.caller!.user, body));
    },
  );

  // Reading an image needs a live session like every other feed route: knowing
  // an identifier is not a credential (ADR 0012).
  for (const [suffix, variant] of [
    ["", "original"],
    ["/thumb", "thumbnail"],
  ] as const) {
    app.get<{ Params: { id: string } }>(
      `/api/v1/media/:id${suffix}`,
      {
        preHandler: asMember,
        schema: {
          params: idParamSchema,
          response: { 404: errorResponseSchema, 410: errorResponseSchema },
          tags: ["media"],
        },
      },
      async (request, reply) => {
        const media = await services.media.read(request.params.id, variant);

        return (
          reply
            .header("cache-control", "private, max-age=31536000, immutable")
            .header("content-length", media.byteSize)
            // The bytes are shown, never interpreted: no sniffing, no scripts,
            // nothing that could turn a stored file into an executed one.
            .header("content-security-policy", "default-src 'none'; sandbox")
            .header("content-type", media.mediaType)
            .header("x-content-type-options", "nosniff")
            .send(Buffer.from(media.bytes))
        );
      },
    );
  }
}
