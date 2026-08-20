import {
  errorResponseSchema,
  federationKeyRequestSchema,
  federationPingResultSchema,
  federationViewSchema,
  type FederatedInstanceView,
  type FederationKeyRequest,
  type FederationPingResult,
  type FederationView,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth, requireRole } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";

import type { InstanceEndpoint } from "./endpoint.js";
import type { RemoteInstanceRecord } from "./repository.js";
import type { FederationService } from "./service.js";

/**
 * Connecting two instances, from the panel.
 *
 * Every route here is `instance_admin`, and that is not a formality: deciding
 * which other instances this one talks to is the administrative link of
 * ADR 0018 — deliberate, and not something a member can cause by accident.
 *
 * The one asymmetry worth noticing: **accepting and asking are the same act.**
 * There is no separate «accept» on the wire, because a connection is two
 * requests that met (ADR 0021), so an administrator accepting simply sends
 * their own request back.
 */

function toView(record: RemoteInstanceRecord): FederatedInstanceView {
  return {
    createdAt: record.createdAt,
    declaredName: record.declaredName,
    lastReachedVia: record.lastReachedVia,
    lastSeenAt: record.lastSeenAt,
    publicKey: record.publicKey,
    state: record.state,
  };
}

export function registerFederationRoutes(
  app: FastifyInstance,
  services: {
    identity: IdentityService;
    federation: FederationService;
    endpoint: InstanceEndpoint;
  },
): void {
  const view = (): FederationView => ({
    instances: services.federation.list().map(toView),
    networkOn: services.endpoint.isOpen,
    reachableByKey: services.endpoint.reachableByKey,
    ...(services.endpoint.endpointId === undefined
      ? {}
      : { endpointId: services.endpoint.endpointId }),
  });

  const onlyAdmin = [requireAuth(services.identity), requireRole("instance_admin")];

  app.get<{ Reply: FederationView }>(
    "/api/v1/federation",
    {
      preHandler: onlyAdmin,
      schema: {
        response: { 200: federationViewSchema, 401: errorResponseSchema, 403: errorResponseSchema },
        tags: ["federation"],
      },
    },
    () => view(),
  );

  app.post<{ Body: FederationKeyRequest; Reply: FederationView }>(
    "/api/v1/federation/connections",
    {
      preHandler: onlyAdmin,
      schema: {
        body: federationKeyRequestSchema,
        response: {
          200: federationViewSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
        },
        tags: ["federation"],
      },
    },
    async (request) => {
      await services.federation.requestConnection(request.body.publicKey);

      return view();
    },
  );

  app.post<{ Body: FederationKeyRequest; Reply: FederationView }>(
    "/api/v1/federation/connections/accept",
    {
      preHandler: onlyAdmin,
      schema: {
        body: federationKeyRequestSchema,
        response: { 200: federationViewSchema, 409: errorResponseSchema },
        tags: ["federation"],
      },
    },
    async (request) => {
      await services.federation.accept(request.body.publicKey);

      return view();
    },
  );

  app.post<{ Body: FederationKeyRequest; Reply: FederationView }>(
    "/api/v1/federation/connections/block",
    {
      preHandler: onlyAdmin,
      schema: {
        body: federationKeyRequestSchema,
        response: { 200: federationViewSchema, 409: errorResponseSchema },
        tags: ["federation"],
      },
    },
    (request) => {
      services.federation.block(request.body.publicKey);

      return view();
    },
  );

  app.post<{ Body: FederationKeyRequest; Reply: FederationView }>(
    "/api/v1/federation/connections/forget",
    {
      preHandler: onlyAdmin,
      schema: {
        body: federationKeyRequestSchema,
        response: { 200: federationViewSchema, 409: errorResponseSchema },
        tags: ["federation"],
      },
    },
    (request) => {
      services.federation.forget(request.body.publicKey);

      return view();
    },
  );

  app.post<{ Body: FederationKeyRequest; Reply: FederationPingResult }>(
    "/api/v1/federation/connections/ping",
    {
      preHandler: onlyAdmin,
      schema: {
        body: federationKeyRequestSchema,
        response: { 200: federationPingResultSchema, 409: errorResponseSchema },
        tags: ["federation"],
      },
    },
    async (request) => services.federation.ping(request.body.publicKey),
  );
}
