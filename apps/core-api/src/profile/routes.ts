import {
  SEARCH_SCOPES,
  errorResponseSchema,
  followRequestSchema,
  followsViewSchema,
  profileSearchResultSchema,
  profileViewSchema,
  updateProfileRequestSchema,
  type FollowRequest,
  type FollowsView,
  type ProfileSearchResult,
  type ProfileView,
  type SearchScope,
  type UpdateProfileRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import type { FederationService } from "../federation/service.js";
import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";

import type { FollowService } from "./follow-service.js";
import type { ProfileService } from "./service.js";

/**
 * The profile, from the inside.
 *
 * Every route needs a session, including search: this instance answers other
 * **instances** on the protocol and its own **members** here, and the two must
 * not be the same door. A search endpoint open to anybody would be an
 * enumeration of the membership dressed as a feature, which is what ADR 0020 §1
 * spends its length forbidding on the network side.
 */
export function registerProfileRoutes(
  app: FastifyInstance,
  services: {
    identity: IdentityService;
    profiles: ProfileService;
    follows: FollowService;
    federation: FederationService;
  },
): void {
  const authenticated = [requireAuth(services.identity)];

  app.get<{ Reply: ProfileView }>(
    "/api/v1/profile",
    {
      preHandler: authenticated,
      schema: { response: { 200: profileViewSchema, 401: errorResponseSchema }, tags: ["profile"] },
    },
    (request) => services.profiles.read(request.caller?.user.id ?? ""),
  );

  app.put<{ Body: UpdateProfileRequest; Reply: ProfileView }>(
    "/api/v1/profile",
    {
      preHandler: authenticated,
      schema: {
        body: updateProfileRequestSchema,
        response: { 200: profileViewSchema, 400: errorResponseSchema },
        tags: ["profile"],
      },
    },
    (request) => services.profiles.update(request.caller?.user.id ?? "", request.body),
  );

  app.get<{ Params: { username: string }; Reply: ProfileView }>(
    "/api/v1/profiles/:username",
    {
      preHandler: authenticated,
      schema: { response: { 200: profileViewSchema, 404: errorResponseSchema }, tags: ["profile"] },
    },
    (request) => {
      const found = services.profiles.searchLocal(request.params.username, 1);
      const exact = found.find((profile) => profile.username === request.params.username);

      if (exact === undefined) {
        throw Object.assign(new Error("Questo profilo non esiste."), { statusCode: 404 });
      }

      return exact;
    },
  );

  app.get<{ Reply: FollowsView }>(
    "/api/v1/profile/follows",
    {
      preHandler: authenticated,
      schema: { response: { 200: followsViewSchema }, tags: ["profile"] },
    },
    (request) => {
      const id = request.caller?.user.id ?? "";

      return {
        followers: services.follows.listFollowers(id).map((row) => ({
          createdAt: row.createdAt,
          id: row.id,
          instanceKey: row.followerInstance,
          state: row.state,
          username: row.followerUsername,
        })),
        following: services.follows.listFollowing(id).map((row) => ({
          createdAt: row.createdAt,
          id: row.id,
          instanceKey: row.targetInstance,
          state: row.state,
          username: row.targetUsername,
        })),
      };
    },
  );

  app.post<{ Body: FollowRequest }>(
    "/api/v1/profile/follows",
    {
      preHandler: authenticated,
      schema: {
        body: followRequestSchema,
        response: { 400: errorResponseSchema },
        tags: ["profile"],
      },
    },
    async (request, reply) => {
      const caller = request.caller;

      await services.follows.follow(
        caller?.user.id ?? "",
        caller?.user.username ?? "",
        request.body,
      );

      return reply.status(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/profile/follows/:id",
    {
      preHandler: authenticated,
      schema: { response: { 404: errorResponseSchema }, tags: ["profile"] },
    },
    async (request, reply) => {
      const caller = request.caller;

      await services.follows.unfollow(
        caller?.user.id ?? "",
        caller?.user.username ?? "",
        request.params.id,
      );

      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/profile/followers/:id/accetta",
    {
      preHandler: authenticated,
      schema: { response: { 404: errorResponseSchema }, tags: ["profile"] },
    },
    (request, reply) => {
      services.follows.accept(request.caller?.user.id ?? "", request.params.id);

      return reply.status(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/v1/profile/followers/:id",
    {
      preHandler: authenticated,
      schema: { response: { 404: errorResponseSchema }, tags: ["profile"] },
    },
    (request, reply) => {
      services.follows.removeFollower(request.caller?.user.id ?? "", request.params.id);

      return reply.status(204).send();
    },
  );

  /**
   * Cercare qualcuno, **dove si sta guardando**.
   *
   * L'ambito non è un filtro sui risultati: decide se la domanda esce di casa.
   * In `istanza` non parte nessuna richiesta verso nessuno — fino al
   * 2026-08-20 partiva sempre, anche per cercare il vicino di sotto, e il
   * termine di ricerca di una persona è un dato suo.
   *
   * In `rete` invece di sé si mostra quello che un'altra istanza vedrebbe: i
   * profili **pubblici**, dallo stesso metodo che risponde sul protocollo. Chi
   * è «presente e privato» resta trovabile in casa e invisibile fuori, che è
   * esattamente ciò che quella scelta promette (ADR 0018).
   */
  app.get<{ Querystring: { q?: string; ambito?: SearchScope }; Reply: ProfileSearchResult }>(
    "/api/v1/profiles",
    {
      preHandler: authenticated,
      schema: {
        querystring: {
          type: "object",
          properties: {
            q: { type: "string" },
            ambito: { type: "string", enum: SEARCH_SCOPES },
          },
        },
        response: { 200: profileSearchResultSchema, 401: errorResponseSchema },
        tags: ["profile"],
      },
    },
    async (request) => {
      const term = (request.query.q ?? "").trim();
      // Chi non dichiara l'ambito cerca in casa: niente esce per omissione.
      const ambito = request.query.ambito ?? "istanza";

      if (term.length === 0) {
        return { locali: [], remoti: [] };
      }

      if (ambito === "istanza") {
        return { locali: services.profiles.searchLocal(term), remoti: [] };
      }

      // Le due metà partono insieme: la ricerca in rete aspetta la più lenta
      // fra le istanze collegate, e non c'è ragione di farle aspettare anche
      // la query locale.
      const [locali, hits] = await Promise.all([
        Promise.resolve(services.profiles.searchLocalPublic(term)),
        services.federation.searchConnected(term),
      ]);

      return {
        locali,
        remoti: hits.map((hit) => ({
          displayName: hit.nome,
          instanceKey: hit.istanza,
          tramite: hit.tramite,
          username: hit.utente,
        })),
      };
    },
  );
}
