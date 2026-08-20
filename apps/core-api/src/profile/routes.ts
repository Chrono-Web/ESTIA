import {
  errorResponseSchema,
  profileSearchResultSchema,
  profileViewSchema,
  updateProfileRequestSchema,
  type ProfileSearchResult,
  type ProfileView,
  type UpdateProfileRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import type { FederationService } from "../federation/service.js";
import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";

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

  app.get<{ Querystring: { q?: string }; Reply: ProfileSearchResult }>(
    "/api/v1/profiles",
    {
      preHandler: authenticated,
      schema: {
        response: { 200: profileSearchResultSchema, 401: errorResponseSchema },
        tags: ["profile"],
      },
    },
    async (request) => {
      const term = (request.query.q ?? "").trim();

      if (term.length === 0) {
        return { locali: [], remoti: [] };
      }

      // Le due metà partono insieme: la ricerca in rete aspetta la più lenta
      // fra le istanze collegate, e non c'è ragione di farle aspettare anche
      // la query locale.
      const [locali, hits] = await Promise.all([
        Promise.resolve(services.profiles.searchLocal(term)),
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
