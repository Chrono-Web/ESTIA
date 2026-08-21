import {
  NOTIFICA_FILTRI,
  NOTIFICA_LENTI,
  notificheNuoveSchema,
  notifichePageSchema,
  type NotificaFiltro,
  type NotificaLente,
  type NotifichePage,
  type NotificheNuove,
} from "@estia/contracts";
import type { FastifyInstance } from "fastify";

import { requireAuth } from "../identity/auth.js";
import type { IdentityService } from "../identity/service.js";

import type { NotificheService } from "./service.js";

/** Quante voci in una pagina. Trenta è quanto si scorre senza pensarci. */
const PAGINA = 30;
const PAGINA_MASSIMA = 50;

/** Il corpo di «le ho viste»: una lente sola, sempre. */
const visteBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["lente"],
  properties: { lente: { type: "string", enum: [...NOTIFICA_LENTI] } },
} as const;

/**
 * Le notifiche di chi chiede, e di nessun altro ([ADR 0025] §4).
 *
 * Non esiste una rotta per le notifiche di qualcun altro e non ci sarà: chi
 * guarda è sempre `request.caller`, mai un nome nell'indirizzo. Non è cautela
 * — è che una superficie del genere sarebbe un modo di leggere le relazioni di
 * una persona chiedendole a lei.
 */
export function registerNotificheRoutes(
  app: FastifyInstance,
  services: { notifiche: NotificheService; identity: IdentityService },
): void {
  const asMember = requireAuth(services.identity);

  app.get<{
    Querystring: {
      cursor?: string;
      limit?: number;
      filtro?: NotificaFiltro;
      lente?: NotificaLente;
    };
    Reply: NotifichePage;
  }>(
    "/api/v1/notifiche",
    {
      preHandler: asMember,
      schema: {
        querystring: {
          type: "object",
          properties: {
            cursor: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: PAGINA_MASSIMA },
            filtro: { type: "string", enum: [...NOTIFICA_FILTRI] },
            lente: { type: "string", enum: [...NOTIFICA_LENTI] },
          },
        },
        response: { 200: notifichePageSchema },
        tags: ["notifiche"],
      },
    },
    async (request) =>
      services.notifiche.pagina(request.caller!.user.id, {
        filtro: request.query.filtro ?? "tutte",
        lente: request.query.lente ?? "istanza",
        limit: request.query.limit ?? PAGINA,
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      }),
  );

  /*
   * Il numero del pallino, da solo.
   *
   * Ha una rotta sua e non è un doppione della pagina: si chiede a intervalli
   * da ogni scheda aperta, e far comporre una pagina intera per disegnare un
   * numero sarebbe lavoro chiesto a un NAS di casa trenta volte all'ora.
   *
   * Il suo tetto è generoso di proposito: chi ha quattro schede aperte non sta
   * facendo niente di sbagliato, e un limite stretto qui punirebbe l'uso
   * normale invece dell'abuso.
   */
  app.get<{ Reply: NotificheNuove }>(
    "/api/v1/notifiche/nuove",
    {
      preHandler: asMember,
      config: { rateLimit: { max: 240, timeWindow: "1 minute" } },
      schema: { response: { 200: notificheNuoveSchema }, tags: ["notifiche"] },
    },
    async (request) => services.notifiche.nuove(request.caller!.user.id),
  );

  /*
   * «Le ho viste» — **in quella lente**.
   *
   * L'istante lo mette il server e non chi chiede: un orologio sbagliato su un
   * telefono spegnerebbe notifiche mai guardate, o le riaccenderebbe tutte.
   *
   * La lente è obbligatoria nel corpo e non un default: qui non esiste
   * «tutte», perché segnare tutte e due insieme è esattamente il modo in cui
   * guardare una lente spegnerebbe in silenzio le novità dell'altra.
   */
  app.post<{ Body: { lente: NotificaLente }; Reply: NotificheNuove }>(
    "/api/v1/notifiche/viste",
    {
      preHandler: asMember,
      schema: {
        body: visteBodySchema,
        response: { 200: notificheNuoveSchema },
        tags: ["notifiche"],
      },
    },
    async (request) => {
      services.notifiche.segnaViste(request.caller!.user.id, request.body.lente);

      return services.notifiche.nuove(request.caller!.user.id);
    },
  );
}
