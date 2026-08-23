import {
  FEED_KINDS,
  commentListSchema,
  commentViewSchema,
  createCommentRequestSchema,
  createPostRequestSchema,
  errorResponseSchema,
  feedSourcesResponseSchema,
  likeResponseSchema,
  postViewSchema,
  timelinePageSchema,
  updateCommentRequestSchema,
  type CommentView,
  type CreateCommentRequest,
  type CreatePostRequest,
  type ErrorResponse,
  type FeedKind,
  type FeedSourcesResponse,
  type LikeResponse,
  type PostView,
  type TimelinePage,
  type UpdateCommentRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import { DomainError } from "../errors.js";
import type { IdentityService } from "../identity/service.js";
import type { TimelineDiRete } from "./rete.js";
import type { FeedService } from "./service.js";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

export function registerFeedRoutes(
  app: FastifyInstance,
  services: {
    feed: FeedService;
    identity: IdentityService;
    /** La metà remota del feed di rete. Assente, resta il comportamento di prima. */
    rete?: TimelineDiRete;
  },
): void {
  // The whole feed is for members: there is no anonymous read. That is what
  // makes it the neighbourhood's board rather than a website.
  const asMember = requireAuth(services.identity);
  const asModerator = [asMember, requireRole("instance_admin", "instance_moderator")];

  app.post<{ Body: CreatePostRequest; Reply: PostView | ErrorResponse }>(
    "/api/v1/posts",
    {
      preHandler: asMember,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        body: createPostRequestSchema,
        response: { 201: postViewSchema, 400: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request, reply) =>
      reply.status(201).send(services.feed.createPost(request.caller!.user, request.body)),
  );

  // Le sorgenti che compongono il feed di chi legge (locale e case remote).
  app.get<{
    Querystring: { feed?: FeedKind };
    Reply: FeedSourcesResponse;
  }>(
    "/api/v1/posts/sources",
    {
      preHandler: asMember,
      schema: {
        querystring: {
          type: "object",
          properties: {
            feed: { type: "string", enum: FEED_KINDS },
          },
        },
        response: { 200: feedSourcesResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => {
      if (services.rete === undefined || request.query.feed !== "seguiti") {
        return {
          local: { count: 0, name: "Questa istanza" },
          remotes: [],
        };
      }

      return services.rete.sorgenti(request.caller!.user.id);
    },
  );

  // I due feed sono la stessa rotta con una lente diversa, non due rotte: la
  // paginazione, i permessi e la forma della risposta sono gli stessi, e
  // duplicarli avrebbe voluto dire mantenerli allineati per sempre.
  app.get<{
    Querystring: {
      cursor?: string;
      limit?: number;
      feed?: FeedKind;
      source?: string;
      instanceKey?: string;
    };
    Reply: TimelinePage;
  }>(
    "/api/v1/posts",
    {
      preHandler: asMember,
      schema: {
        querystring: {
          type: "object",
          properties: {
            cursor: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 50 },
            feed: { type: "string", enum: FEED_KINDS },
            source: { type: "string" },
            instanceKey: { type: "string" },
          },
        },
        response: { 200: timelinePageSchema },
        tags: ["feed"],
      },
    },
    async (request) => {
      /*
       * Le due lenti sono la stessa rotta, e da qui in poi anche due strade.
       *
       * «Istanza» legge una tabella; «rete» compone quella tabella con le
       * bacheche delle case che si seguono ([ADR 0023] §5). La differenza sta
       * qui e non nell'interfaccia, perché ciò che si vede in una lente non
       * deve dipendere da quale schermata l'ha chiesto — la pagina di una
       * persona e il feed devono poter dare la stessa risposta.
       */
      if (request.query.feed !== "seguiti" || services.rete === undefined) {
        return services.feed.timeline(request.caller!.user, request.query);
      }

      // 1. Richiesta della sola metà locale del feed di rete
      if (request.query.source === "local") {
        return services.feed.timeline(request.caller!.user, {
          ...request.query,
          feed: "seguiti",
        });
      }

      // 2. Richiesta dei post di una specifica istanza remota
      if (request.query.instanceKey !== undefined) {
        return services.rete.paginaRemota(request.caller!.user, request.query.instanceKey, {
          limit: Math.min(request.query.limit ?? 20, 50),
          ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
        });
      }

      // 3. Comportamento monolitico completo (tutte le sorgenti)
      return services.rete.pagina(request.caller!.user, {
        limit: Math.min(request.query.limit ?? 20, 50),
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      });
    },
  );

  app.get<{ Params: { id: string }; Reply: PostView | ErrorResponse }>(
    "/api/v1/posts/:id",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 200: postViewSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => services.feed.getPost(request.caller!.user, request.params.id),
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/posts/:id",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 403: errorResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request, reply) => {
      await services.feed.deletePost(request.caller!.user, request.params.id);

      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: { hidden: boolean }; Reply: PostView | ErrorResponse }>(
    "/api/v1/posts/:id/hidden",
    {
      preHandler: asModerator,
      schema: {
        params: idParamSchema,
        body: {
          type: "object",
          required: ["hidden"],
          additionalProperties: false,
          properties: { hidden: { type: "boolean" } },
        },
        response: { 200: postViewSchema, 403: errorResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) =>
      services.feed.setPostHidden(request.caller!.user, request.params.id, request.body.hidden),
  );

  app.put<{ Params: { id: string }; Reply: LikeResponse | ErrorResponse }>(
    "/api/v1/posts/:id/like",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 200: likeResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => services.feed.like(request.caller!.user, request.params.id, true),
  );

  app.delete<{ Params: { id: string }; Reply: LikeResponse | ErrorResponse }>(
    "/api/v1/posts/:id/like",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 200: likeResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => services.feed.like(request.caller!.user, request.params.id, false),
  );

  app.get<{ Params: { id: string }; Reply: { comments: CommentView[] } | ErrorResponse }>(
    "/api/v1/posts/:id/comments",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 200: commentListSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => ({
      comments: services.feed.listComments(request.caller!.user, request.params.id),
    }),
  );

  app.post<{
    Params: { id: string };
    Body: CreateCommentRequest;
    Reply: CommentView | ErrorResponse;
  }>(
    "/api/v1/posts/:id/comments",
    {
      preHandler: asMember,
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
      schema: {
        params: idParamSchema,
        body: createCommentRequestSchema,
        response: { 201: commentViewSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          services.feed.addComment(
            request.caller!.user,
            request.params.id,
            request.body.body,
            request.body.parentId,
          ),
        ),
  );

  app.patch<{
    Params: { id: string };
    Body: UpdateCommentRequest;
    Reply: CommentView | ErrorResponse;
  }>(
    "/api/v1/comments/:id",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        body: updateCommentRequestSchema,
        response: {
          200: commentViewSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
        tags: ["feed"],
      },
    },
    async (request) =>
      services.feed.updateComment(request.caller!.user, request.params.id, request.body.body),
  );

  app.post<{
    Params: { id: string };
    Body: { hidden: boolean };
    Reply: CommentView | ErrorResponse;
  }>(
    "/api/v1/comments/:id/hidden",
    {
      preHandler: asModerator,
      schema: {
        params: idParamSchema,
        body: {
          type: "object",
          required: ["hidden"],
          additionalProperties: false,
          properties: { hidden: { type: "boolean" } },
        },
        response: {
          200: commentViewSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
        tags: ["feed"],
      },
    },
    async (request) =>
      services.feed.setCommentHidden(request.caller!.user, request.params.id, request.body.hidden),
  );

  app.put<{ Params: { id: string }; Reply: LikeResponse | ErrorResponse }>(
    "/api/v1/comments/:id/like",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 200: likeResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => services.feed.likeComment(request.caller!.user, request.params.id, true),
  );

  app.delete<{ Params: { id: string }; Reply: LikeResponse | ErrorResponse }>(
    "/api/v1/comments/:id/like",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 200: likeResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request) => services.feed.likeComment(request.caller!.user, request.params.id, false),
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/comments/:id",
    {
      preHandler: asMember,
      schema: {
        params: idParamSchema,
        response: { 403: errorResponseSchema, 404: errorResponseSchema },
        tags: ["feed"],
      },
    },
    async (request, reply) => {
      services.feed.deleteComment(request.caller!.user, request.params.id);

      return reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string }; Reply: { body: string } | ErrorResponse }>(
    "/api/v1/public/comments/:id",
    {
      schema: {
        params: idParamSchema,
        response: {
          200: {
            type: "object",
            required: ["body"],
            properties: { body: { type: "string" } },
          },
          404: errorResponseSchema,
        },
        tags: ["feed"],
      },
    },
    async (request) => {
      const comment = services.feed.getPublicComment(request.params.id);
      if (comment === undefined) {
        throw new DomainError("comment_not_found", "Commento non trovato.", 404);
      }
      return { body: comment.body };
    },
  );
}
