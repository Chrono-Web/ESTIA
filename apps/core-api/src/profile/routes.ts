import {
  FEED_KINDS,
  SEARCH_SCOPES,
  errorResponseSchema,
  followRequestSchema,
  followsViewSchema,
  personViewSchema,
  profileSearchResultSchema,
  profileViewSchema,
  timelinePageSchema,
  updateProfileRequestSchema,
  type FeedKind,
  type FollowRequest,
  type FollowsView,
  type PersonView,
  type ProfileSearchResult,
  type ProfileView,
  type Relazione,
  type SearchScope,
  type TimelinePage,
  type UpdateProfileRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import type { FeedService } from "../feed/service.js";
import type { TimelineDiRete } from "../feed/rete.js";
import { PROVA_PROFILO_PUBBLICO } from "../federation/protocol.js";
import type { FederationService } from "../federation/service.js";
import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";

import { DomainError } from "../errors.js";

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
    feed: FeedService;
    /** La visita alle bacheche remote ([ADR 0023]). */
    rete?: TimelineDiRete;
  },
  limits: { maxBytes: number } = { maxBytes: 5 * 1024 * 1024 },
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
    (request) => {
      const userId = request.caller?.user.id ?? "";

      // Due tabelle, due servizi: il nome sta nell'identità, la descrizione nel
      // profilo. Il nome per primo, perché è quello che può essere rifiutato.
      if (request.body.displayName !== undefined) {
        services.identity.rename(userId, request.body.displayName);
      }

      return services.profiles.update(userId, request.body);
    },
  );

  /**
   * La pagina di una persona.
   *
   * La `relazione` la calcola l'istanza e non il browser, e non è una comodità:
   * dipende dalla lista dei follower di **quella** persona, che è la lista che
   * autorizza (ADR 0022) e che chi guarda non ha alcun diritto di ricevere.
   * Qui esce un solo bit di essa — «tu sì» oppure «tu no» — che è quanto serve
   * a disegnare un pulsante.
   */
  app.get<{ Params: { username: string }; Reply: PersonView }>(
    "/api/v1/profiles/:username",
    {
      preHandler: authenticated,
      schema: { response: { 200: personViewSchema, 404: errorResponseSchema }, tags: ["profile"] },
    },
    (request) => {
      const caller = request.caller!.user;
      const record = services.profiles.findMember(request.params.username);

      if (record === undefined) {
        throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
      }

      const followers = services.follows.listFollowers(record.userId);
      const proprio = record.userId === caller.id;
      const daChiGuarda = followers.find(
        (row) => row.followerInstance === "locale" && row.followerUsername === caller.username,
      );

      const relazione: Relazione = proprio
        ? "sei_tu"
        : daChiGuarda === undefined
          ? "nessuna"
          : daChiGuarda.state === "accettato"
            ? "seguito"
            : "in_attesa";

      return {
        bio: record.bio,
        createdAt: record.createdAt,
        displayName: record.displayName,
        followerCount: followers.filter((row) => row.state === "accettato").length,
        followingCount: services.follows
          .listFollowing(record.userId)
          .filter((row) => row.state === "accettato").length,
        relazione,
        username: record.username,
        // Presenza e follow aperti sono decisioni di chi le prende, non fatti
        // su di lei: compaiono solo a chi guarda sé stesso. `pubblico` invece
        // dice a chi visita che cosa vedrà sul profilo.
        ...(proprio
          ? { openFollows: record.openFollows, presence: record.presence }
          : { pubblico: record.openFollows }),
      };
    },
  );

  /**
   * La pagina di una persona di un'altra istanza.
   *
   * Usa il messaggio `profilo` già nel protocollo: fino a qui esisteva e non
   * aveva una porta HTTP ([ADR 0023], voce M5). «Non trovato» e «istanza spenta»
   * rispondono uguale — la stessa regola di ADR 0020 §1.
   */
  app.get<{
    Params: { instanceKey: string; username: string };
    Reply: PersonView;
  }>(
    "/api/v1/remote/:instanceKey/:username",
    {
      preHandler: authenticated,
      schema: { response: { 200: personViewSchema, 404: errorResponseSchema }, tags: ["profile"] },
    },
    async (request) => {
      const caller = request.caller!.user;
      const { instanceKey, username } = request.params;
      const profilo = await services.federation.remoteProfile(instanceKey, username);

      if (profilo === undefined) {
        throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
      }

      const riga = services.follows
        .listFollowing(caller.id)
        .find((row) => row.targetInstance === instanceKey && row.targetUsername === username);

      const relazione: Relazione =
        riga === undefined ? "nessuna" : riga.state === "accettato" ? "seguito" : "in_attesa";

      return {
        bio: profilo.bio,
        createdAt: "",
        displayName: profilo.nome,
        followerCount: 0,
        followingCount: 0,
        pubblico: profilo.pubblico,
        relazione,
        remoto: { instanceKey, istanza: services.federation.nomeDi(instanceKey) },
        username: profilo.utente,
        ...(relazione === "seguito" ? { leggibile: riga?.grant !== null } : {}),
      };
    },
  );

  /**
   * I post di una persona di un'altra istanza: la stessa visita della bacheca,
   * per un nome solo. Senza prova la pagina è vuota, non un errore.
   */
  app.get<{
    Params: { instanceKey: string; username: string };
    Querystring: { cursor?: string };
    Reply: TimelinePage;
  }>(
    "/api/v1/remote/:instanceKey/:username/posts",
    {
      preHandler: authenticated,
      schema: {
        querystring: {
          type: "object",
          properties: { cursor: { type: "string" } },
        },
        response: { 200: timelinePageSchema, 404: errorResponseSchema },
        tags: ["profile"],
      },
    },
    async (request) => {
      if (services.rete === undefined) {
        return { posts: [] };
      }

      return services.rete.persona(
        request.caller!.user,
        request.params.instanceKey,
        request.params.username,
        {
          limit: 20,
          ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
        },
      );
    },
  );

  /**
   * Una fotografia di un'altra casa, sotto la sessione di chi legge.
   *
   * L'istanza fa da **proxy e non da archivio** ([ADR 0023] §4): prende i byte
   * quando il browser li chiede, li serve come vuole [ADR 0012], e non li
   * scrive su disco. Senza prova di follow la risposta è la stessa di un id
   * inventato — 404 — perché distinguerli ricostruirebbe l'enumerazione.
   */
  for (const [suffix, variante] of [
    ["", "originale"],
    ["/thumb", "miniatura"],
  ] as const) {
    app.get<{
      Params: { instanceKey: string; username: string; id: string };
    }>(
      `/api/v1/remote/:instanceKey/:username/media/:id${suffix}`,
      {
        preHandler: authenticated,
        schema: {
          params: {
            type: "object",
            required: ["instanceKey", "username", "id"],
            properties: {
              instanceKey: { type: "string" },
              username: { type: "string" },
              id: { type: "string" },
            },
          },
          response: { 404: errorResponseSchema, 413: errorResponseSchema },
          tags: ["media"],
        },
      },
      async (request, reply) => {
        const caller = request.caller!.user;
        const { instanceKey, username, id } = request.params;
        const riga = services.follows
          .listFollowing(caller.id)
          .find(
            (row) =>
              row.targetInstance === instanceKey &&
              row.targetUsername === username &&
              row.state === "accettato" &&
              row.grant !== null,
          );

        let prova = riga?.grant ?? null;

        if (prova === null) {
          const profilo = await services.federation.remoteProfile(instanceKey, username);

          if (profilo?.pubblico !== true) {
            throw new DomainError("media_not_found", "Immagine non trovata.", 404);
          }

          prova = PROVA_PROFILO_PUBBLICO;
        }

        const esito = await services.federation.fetchImmagine(
          instanceKey,
          { nome: username, prova },
          {
            da: caller.username,
            id,
            maxBytes: limits.maxBytes,
            variante,
          },
        );

        if (esito === undefined) {
          throw new DomainError("media_not_found", "Immagine non trovata.", 404);
        }

        if (esito === "troppo_grande") {
          throw new DomainError(
            "media_too_large",
            "L'immagine supera il limite di questa istanza.",
            413,
          );
        }

        return reply
          .header("cache-control", "private, max-age=31536000, immutable")
          .header("content-length", esito.bytes.byteLength)
          .header("content-security-policy", "default-src 'none'; sandbox")
          .header("content-type", esito.mediaType)
          .header("x-content-type-options", "nosniff")
          .send(Buffer.from(esito.bytes));
      },
    );
  }

  /**
   * I post di una persona, **nella lente in cui si sta guardando**.
   *
   * Lo stesso filtro del feed, con in più il nome dell'autore: se in modalità
   * rete quella persona non ha accettato chi guarda, la sua pagina è vuota
   * esattamente come il feed. Una pagina di profilo non è una scorciatoia
   * attorno a un permesso.
   */
  app.get<{
    Params: { username: string };
    Querystring: { feed?: FeedKind; cursor?: string };
    Reply: TimelinePage;
  }>(
    "/api/v1/profiles/:username/posts",
    {
      preHandler: authenticated,
      schema: {
        querystring: {
          type: "object",
          properties: {
            feed: { type: "string", enum: FEED_KINDS },
            cursor: { type: "string" },
          },
        },
        response: { 200: timelinePageSchema, 404: errorResponseSchema },
        tags: ["profile"],
      },
    },
    (request) => {
      const caller = request.caller!.user;
      const record = services.profiles.findMember(request.params.username);

      if (record === undefined) {
        throw new DomainError("profilo_inesistente", "Questo profilo non esiste.", 404);
      }

      // Profilo privato sull'istanza: i post li vede chi è accettato (o sé
      // stesso). Pubblico = openFollows, e allora la timeline filtra da sola.
      if (!record.openFollows && record.userId !== caller.id) {
        const riga = services.follows
          .listFollowers(record.userId)
          .find(
            (row) =>
              row.followerInstance === "locale" &&
              row.followerUsername === caller.username &&
              row.state === "accettato",
          );

        if (riga === undefined) {
          return { posts: [] };
        }
      }

      return services.feed.timeline(caller, {
        authorId: record.userId,
        ...request.query,
      });
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
          // Se la prova c'è, mai quale: un segreto che serve a parlare con
          // un'altra istanza non ha niente da fare in un browser.
          leggibile: row.targetInstance === "locale" || row.grant !== null,
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
   * In `rete` invece di sé si mostra quello che un'altra istanza vedrebbe: chi
   * è in EstiaNet, dallo stesso metodo che risponde sul protocollo. Privato o
   * pubblico decide i post sul profilo, non l'elenco (ADR 0018).
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
