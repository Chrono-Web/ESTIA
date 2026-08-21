import {
  NOTIFICA_FILTRI,
  notificheNuoveSchema,
  notifichePageSchema,
  type NotificaFiltro,
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
    Querystring: { cursor?: string; limit?: number; filtro?: NotificaFiltro };
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
          },
        },
        response: { 200: notifichePageSchema },
        tags: ["notifiche"],
      },
    },
    async (request) =>
      services.notifiche.pagina(request.caller!.user.id, {
        filtro: request.query.filtro ?? "tutte",
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
   * «Le ho viste.»
   *
   * L'istante lo mette il server e non chi chiede: un orologio sbagliato su un
   * telefono spegnerebbe notifiche mai guardate, o le riaccenderebbe tutte.
   */
  app.post<{ Reply: NotificheNuove }>(
    "/api/v1/notifiche/viste",
    {
      preHandler: asMember,
      schema: { response: { 200: notificheNuoveSchema }, tags: ["notifiche"] },
    },
    async (request) => {
      services.notifiche.segnaViste(request.caller!.user.id);

      return services.notifiche.nuove(request.caller!.user.id);
    },
  );
}
