import {
  conversazioneMessaggiPageSchema,
  conversazioneViewSchema,
  createConversazioneRequestSchema,
  inviaMessaggioRequestSchema,
  messaggioBustaViewSchema,
  segnaConversazioneLettaRequestSchema,
  type ConversazioneMessaggiPage,
  type ConversazioneView,
  type CreateConversazioneRequest,
  type InviaMessaggioRequest,
  type MessaggioBustaView,
  type SegnaConversazioneLettaRequest,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";
import type { MessaggiService } from "./service.js";

export function registerMessaggiRoutes(
  app: FastifyInstance,
  services: { messaggi: MessaggiService; identity: IdentityService },
): void {
  const asMember = requireAuth(services.identity);

  /** Elenco delle conversazioni del membro chiamante. */
  app.get<{
    Reply: { conversazioni: ConversazioneView[] };
  }>(
    "/api/v1/conversazioni",
    {
      preHandler: asMember,
      schema: {
        response: {
          200: {
            type: "object",
            required: ["conversazioni"],
            properties: {
              conversazioni: { type: "array", items: conversazioneViewSchema },
            },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      const conversazioni = services.messaggi.listConversazioni(caller.user.id);
      return { conversazioni };
    },
  );

  /** Crea o recupera una conversazione 1:1, inviando opzionalmente una prima busta. */
  app.post<{
    Body: CreateConversazioneRequest;
    Reply: { conversazione: ConversazioneView; initialMessaggio?: MessaggioBustaView };
  }>(
    "/api/v1/conversazioni",
    {
      preHandler: asMember,
      schema: {
        body: createConversazioneRequestSchema,
        response: {
          200: {
            type: "object",
            required: ["conversazione"],
            properties: {
              conversazione: conversazioneViewSchema,
              initialMessaggio: messaggioBustaViewSchema,
            },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      return services.messaggi.getOrCreateDirect(caller.user.id, caller.sessionId, request.body);
    },
  );

  /** Dettaglio singola conversazione. */
  app.get<{
    Params: { id: string };
    Reply: { conversazione: ConversazioneView };
  }>(
    "/api/v1/conversazioni/:id",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            required: ["conversazione"],
            properties: {
              conversazione: conversazioneViewSchema,
            },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      const conversazione = services.messaggi.getConversazione(caller.user.id, request.params.id);
      return { conversazione };
    },
  );

  /** Lettura messaggi (buste cifrate) di una conversazione. */
  app.get<{
    Params: { id: string };
    Querystring: { limit?: number; before?: string };
    Reply: ConversazioneMessaggiPage;
  }>(
    "/api/v1/conversazioni/:id/messaggi",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
            before: { type: "string" },
          },
        },
        response: {
          200: conversazioneMessaggiPageSchema,
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      return services.messaggi.listMessaggi(caller.user.id, request.params.id, {
        ...(request.query.limit !== undefined ? { limit: request.query.limit } : {}),
        ...(request.query.before !== undefined ? { before: request.query.before } : {}),
      });
    },
  );

  /** Invio di una busta cifrata all'interno di una conversazione. */
  app.post<{
    Params: { id: string };
    Body: InviaMessaggioRequest;
    Reply: { messaggio: MessaggioBustaView };
  }>(
    "/api/v1/conversazioni/:id/messaggi",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: inviaMessaggioRequestSchema,
        response: {
          200: {
            type: "object",
            required: ["messaggio"],
            properties: {
              messaggio: messaggioBustaViewSchema,
            },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      const messaggio = services.messaggi.inviaMessaggio(
        caller.user.id,
        caller.sessionId,
        request.params.id,
        request.body.busta,
      );
      return { messaggio };
    },
  );

  /** Segna la conversazione come letta fino a un certo timestamp. */
  app.post<{
    Params: { id: string };
    Body: SegnaConversazioneLettaRequest;
    Reply: { ok: true };
  }>(
    "/api/v1/conversazioni/:id/visto",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: segnaConversazioneLettaRequestSchema,
        response: {
          200: {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean", const: true } },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      services.messaggi.markRead(caller.user.id, request.params.id, request.body.finoA);
      return { ok: true };
    },
  );

  /** Elimina l'intera conversazione e tutti i relativi messaggi. */
  app.delete<{
    Params: { id: string };
    Reply: { ok: true };
  }>(
    "/api/v1/conversazioni/:id",
    {
      preHandler: asMember,
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean", const: true } },
          },
        },
      },
    },
    async (request) => {
      const caller = request.caller!;
      services.messaggi.deleteConversazione(caller.user.id, request.params.id);
      return { ok: true };
    },
  );
}
