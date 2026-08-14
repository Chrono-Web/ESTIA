import {
  commentListSchema,
  commentViewSchema,
  createCommentRequestSchema,
  createPostRequestSchema,
  errorResponseSchema,
  likeResponseSchema,
  postViewSchema,
  timelinePageSchema,
  type CommentView,
  type CreateCommentRequest,
  type CreatePostRequest,
  type ErrorResponse,
  type LikeResponse,
  type PostView,
  type TimelinePage,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { FeedService } from "./service.js";

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
} as const;

export function registerFeedRoutes(
  app: FastifyInstance,
  services: { feed: FeedService; identity: IdentityService },
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

  app.get<{ Querystring: { cursor?: string; limit?: number }; Reply: TimelinePage }>(
    "/api/v1/posts",
    {
      preHandler: asMember,
      schema: {
        querystring: {
          type: "object",
          properties: {
            cursor: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 50 },
          },
        },
        response: { 200: timelinePageSchema },
        tags: ["feed"],
      },
    },
    async (request) => services.feed.timeline(request.caller!.user, request.query),
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
      services.feed.deletePost(request.caller!.user, request.params.id);

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
        .send(services.feed.addComment(request.caller!.user, request.params.id, request.body.body)),
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
}
