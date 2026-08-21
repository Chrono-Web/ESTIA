import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

/**
 * L'attività, che è una **lettura** e non un registro ([ADR 0025] §4).
 *
 * Quasi tutti i test qui provano la stessa proprietà da angoli diversi: la
 * notifica non sopravvive al fatto che l'ha causata. È la ragione per cui non
 * esiste una tabella di eventi, quindi è la cosa che va fissata, non il fatto
 * che un cuore produca una riga.
 */

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "palu" };

function configFor(dataDir: string): AppConfig {
  return loadConfig({
    ESTIA_DATA_DIR: dataDir,
    ESTIA_HOST: "127.0.0.1",
    ESTIA_LOG_LEVEL: "silent",
  });
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

interface Casa {
  app: FastifyInstance;
  anna: string;
  marco: string;
  lucia: string;
}

async function conDueMembri(use: (casa: Casa) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    try {
      await app.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      const entra = async (username: string): Promise<string> => {
        await app.identityService.createUser({
          password: "password-lunga-ok",
          role: "member",
          username,
        });

        const risposta = await app.inject({
          method: "POST",
          payload: { password: "password-lunga-ok", username },
          url: "/api/v1/auth/login",
        });

        return risposta.json().token;
      };

      await use({
        anna: await entra("anna"),
        app,
        lucia: await entra("lucia"),
        marco: await entra("marco"),
      });
    } finally {
      await app.close();
    }
  });
}

async function scrive(app: FastifyInstance, token: string, testo: string): Promise<string> {
  const risposta = await app.inject({
    headers: bearer(token),
    method: "POST",
    payload: { body: testo },
    url: "/api/v1/posts",
  });

  return risposta.json().id;
}

async function attivita(
  app: FastifyInstance,
  token: string,
  query = "",
): Promise<{
  altrove?: number;
  notifiche: { tipo: string; nuova: boolean; attori: { username: string }[]; altri: number }[];
  nuove: number;
  nextCursor?: string;
}> {
  const risposta = await app.inject({
    headers: bearer(token),
    method: "GET",
    url: `/api/v1/notifiche${query}`,
  });

  return risposta.json();
}

/** «Le ho viste» — in una lente sola, come la rotta chiede. */
async function viste(app: FastifyInstance, token: string, lente: string): Promise<void> {
  await app.inject({
    headers: bearer(token),
    method: "POST",
    payload: { lente },
    url: "/api/v1/notifiche/viste",
  });
}

/** Accetta l'ultima richiesta di follow arrivata: il follow di default è chiuso. */
async function accettaUltimaRichiesta(app: FastifyInstance, token: string): Promise<void> {
  const pagina = await attivita(app, token, "?filtro=follow&lente=istanza");
  const voce = pagina.notifiche[0] as unknown as { followerId: string };

  await app.inject({
    headers: bearer(token),
    method: "POST",
    url: `/api/v1/profile/followers/${voce.followerId}/accetta`,
  });
}

describe("l'attività di una persona", () => {
  it("racconta chi ha messo un cuore e chi ha risposto, e non le proprie azioni", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      const post = await scrive(app, anna, "Domani mercatino in cortile.");

      // Anna mette un cuore al proprio post: non è una notizia per Anna.
      await app.inject({ headers: bearer(anna), method: "PUT", url: `/api/v1/posts/${post}/like` });
      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${post}/like`,
      });
      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { body: "Ci sono." },
        url: `/api/v1/posts/${post}/comments`,
      });

      const pagina = await attivita(app, anna);

      // Entrambe le cose ci sono; l'ordine fra due fatti nello stesso
      // millisecondo non è una proprietà di nessuno, e non la si pretende.
      expect(pagina.notifiche.map((n) => n.tipo).sort()).toEqual(["cuore_post", "risposta_post"]);
      expect(pagina.notifiche.every((n) => n.attori[0]?.username === "marco")).toBe(true);
      // Due cose successe, due nuove: il pallino conta i fatti, non le righe.
      expect(pagina.nuove).toBe(2);

      // E a Marco non arriva niente: le sue azioni non sono notizie per lui.
      expect((await attivita(app, marco)).notifiche).toEqual([]);
    });
  });

  it("porta sopra la cosa tua e sotto le parole di chi ha risposto", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      const post = await scrive(app, anna, "Domani mercatino in cortile.");

      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { body: "A che ora?" },
        url: `/api/v1/posts/${post}/comments`,
      });

      const pagina = await attivita(app, anna);
      const voce = pagina.notifiche[0] as unknown as {
        oggetto: { anteprima: string; risposta: string; postId: string };
      };

      expect(voce.oggetto.anteprima).toBe("Domani mercatino in cortile.");
      expect(voce.oggetto.risposta).toBe("A che ora?");
      expect(voce.oggetto.postId).toBe(post);
    });
  });

  it("raggruppa i cuori sullo stesso post e tiene separate le risposte", async () => {
    await conDueMembri(async ({ app, anna, lucia, marco }) => {
      const post = await scrive(app, anna, "Ho trovato un gatto.");

      for (const chi of [marco, lucia]) {
        await app.inject({
          headers: bearer(chi),
          method: "PUT",
          url: `/api/v1/posts/${post}/like`,
        });
        await app.inject({
          headers: bearer(chi),
          method: "POST",
          payload: { body: "Che bello." },
          url: `/api/v1/posts/${post}/comments`,
        });
      }

      const pagina = await attivita(app, anna);

      // Un solo cuore in elenco, con due facce dentro; due risposte distinte,
      // perché fondere due risposte nasconderebbe delle parole.
      const cuori = pagina.notifiche.filter((n) => n.tipo === "cuore_post");
      const risposte = pagina.notifiche.filter((n) => n.tipo === "risposta_post");

      expect(cuori).toHaveLength(1);
      expect(cuori[0]?.attori.map((a) => a.username).sort()).toEqual(["lucia", "marco"]);
      expect(cuori[0]?.altri).toBe(0);
      expect(risposte).toHaveLength(2);
      // Il conteggio resta sui fatti: quattro, non due voci in elenco.
      expect(pagina.nuove).toBe(4);
    });
  });

  it("una risposta a un tuo commento arriva a te, anche sotto il post di un altro", async () => {
    await conDueMembri(async ({ app, anna, lucia, marco }) => {
      const post = await scrive(app, anna, "Chi viene al mercatino?");
      const commento = await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { body: "Io ci sono." },
        url: `/api/v1/posts/${post}/comments`,
      });

      await app.inject({
        headers: bearer(lucia),
        method: "POST",
        payload: { body: "Anch'io!", parentId: commento.json().id },
        url: `/api/v1/posts/${post}/comments`,
      });

      const suoi = await attivita(app, marco);

      expect(suoi.notifiche.map((n) => n.tipo)).toEqual(["risposta_commento"]);
      expect(suoi.notifiche[0]?.attori[0]?.username).toBe("lucia");
    });
  });

  it("un post cancellato porta via le proprie notifiche, senza pulizie", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      const post = await scrive(app, anna, "Domani mercatino in cortile.");

      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${post}/like`,
      });
      expect((await attivita(app, anna)).notifiche).toHaveLength(1);

      await app.inject({ headers: bearer(anna), method: "DELETE", url: `/api/v1/posts/${post}` });

      // Non c'è nessuna copia da invalidare: è la proprietà per cui la tabella
      // di eventi non esiste.
      expect((await attivita(app, anna)).notifiche).toEqual([]);
      expect((await attivita(app, anna)).nuove).toBe(0);
    });
  });

  it("un cuore tolto toglie la propria notifica", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      const post = await scrive(app, anna, "Domani mercatino in cortile.");

      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${post}/like`,
      });
      await app.inject({
        headers: bearer(marco),
        method: "DELETE",
        url: `/api/v1/posts/${post}/like`,
      });

      expect((await attivita(app, anna)).notifiche).toEqual([]);
    });
  });

  it("segna fin dove si è guardato, e non torna indietro", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      const post = await scrive(app, anna, "Domani mercatino in cortile.");

      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${post}/like`,
      });
      expect((await attivita(app, anna)).nuove).toBe(1);

      await viste(app, anna, "istanza");

      const dopo = await attivita(app, anna);

      // La riga resta in elenco — è successa — ma non è più nuova.
      expect(dopo.notifiche).toHaveLength(1);
      expect(dopo.notifiche[0]?.nuova).toBe(false);
      expect(dopo.nuove).toBe(0);

      const nuove = await app.inject({
        headers: bearer(anna),
        method: "GET",
        url: "/api/v1/notifiche/nuove",
      });

      expect(nuove.json()).toEqual({ istanza: 0, nuove: 0, rete: 0 });
    });
  });

  it("i filtri mostrano una cosa sola per volta", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      const post = await scrive(app, anna, "Domani mercatino in cortile.");

      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${post}/like`,
      });
      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { body: "Ci sono." },
        url: `/api/v1/posts/${post}/comments`,
      });

      expect((await attivita(app, anna, "?filtro=cuori")).notifiche.map((n) => n.tipo)).toEqual([
        "cuore_post",
      ]);
      expect((await attivita(app, anna, "?filtro=risposte")).notifiche.map((n) => n.tipo)).toEqual([
        "risposta_post",
      ]);
      expect((await attivita(app, anna, "?filtro=follow")).notifiche).toEqual([]);
    });
  });

  it("la lente divide casa e rete, e ogni lente conta se stessa", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      // Marco chiede di seguire Anna e lei accetta: serve per poter toccare il
      // post scritto per la rete, e lascia a Anna una notifica **di casa** —
      // che fa parte del conto.
      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { instanceKey: "locale", username: "anna" },
        url: "/api/v1/profile/follows",
      });
      await accettaUltimaRichiesta(app, anna);

      const diCasa = await scrive(app, anna, "Domani mercatino in cortile.");
      const perLaRete = await app.inject({
        headers: bearer(anna),
        method: "POST",
        payload: { body: "Per chi ci segue da fuori.", scope: "followers" },
        url: "/api/v1/posts",
      });

      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${diCasa}/like`,
      });
      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${perLaRete.json().id}/like`,
      });
      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { body: "Ci sono." },
        url: `/api/v1/posts/${perLaRete.json().id}/comments`,
      });

      const casa = await attivita(app, anna, "?lente=istanza");
      const rete = await attivita(app, anna, "?lente=rete");

      // Ciò che riguarda un post di casa resta in casa — follow compreso,
      // perché seguire un vicino non passa dalla rete ([ADR 0022]).
      expect(casa.notifiche.map((n) => n.tipo).sort()).toEqual(["cuore_post", "follow_nuovo"]);
      expect(casa.nuove).toBe(2);
      expect(casa.altrove).toBe(2);

      // Ciò che riguarda un post della rete sta nella rete, anche se chi l'ha
      // fatto è di casa: la lente è quella della cosa, non della persona.
      expect(rete.notifiche.map((n) => n.tipo).sort()).toEqual(["cuore_post", "risposta_post"]);
      expect(rete.nuove).toBe(2);
      expect(rete.altrove).toBe(2);

      // Il pallino è uno e parla di entrambe.
      const nuove = await app.inject({
        headers: bearer(anna),
        method: "GET",
        url: "/api/v1/notifiche/nuove",
      });

      expect(nuove.json()).toEqual({ istanza: 2, nuove: 4, rete: 2 });
    });
  });

  it("guardare una lente non spegne le novità dell'altra", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { instanceKey: "locale", username: "anna" },
        url: "/api/v1/profile/follows",
      });
      await accettaUltimaRichiesta(app, anna);

      const perLaRete = await app.inject({
        headers: bearer(anna),
        method: "POST",
        payload: { body: "Per chi ci segue da fuori.", scope: "followers" },
        url: "/api/v1/posts",
      });

      await app.inject({
        headers: bearer(marco),
        method: "PUT",
        url: `/api/v1/posts/${perLaRete.json().id}/like`,
      });

      // Una notizia di casa (il follow) e una della rete (il cuore).
      const casa = await attivita(app, anna, "?lente=istanza");

      expect(casa.nuove).toBe(1);
      expect(casa.altrove).toBe(1);

      // Guardare l'istanza segna **solo** l'istanza.
      await viste(app, anna, "istanza");

      const dopo = await attivita(app, anna, "?lente=istanza");

      expect(dopo.nuove).toBe(0);
      expect(dopo.notifiche[0]?.nuova).toBe(false);
      expect(dopo.altrove).toBe(1);

      const nuove = await app.inject({
        headers: bearer(anna),
        method: "GET",
        url: "/api/v1/notifiche/nuove",
      });

      // Il pallino cade solo della metà vista: la rete è rimasta.
      expect(nuove.json()).toEqual({ istanza: 0, nuove: 1, rete: 1 });

      // E nell'altra lente nulla è cambiato: né il conto né il segno.
      const altra = await attivita(app, anna, "?lente=rete");

      expect(altra.nuove).toBe(1);
      expect(altra.altrove).toBe(0);
      expect(altra.notifiche[0]?.nuova).toBe(true);
    });
  });

  it("una richiesta di follow si legge e si accetta da qui", async () => {
    await conDueMembri(async ({ app, anna, marco }) => {
      // Anna chiude il proprio profilo: così un follow diventa una richiesta.
      await app.inject({
        headers: bearer(anna),
        method: "PUT",
        payload: { bio: "", openFollows: false, presence: "presente_privato" },
        url: "/api/v1/profile",
      });

      await app.inject({
        headers: bearer(marco),
        method: "POST",
        payload: { instanceKey: "locale", username: "anna" },
        url: "/api/v1/profile/follows",
      });

      const pagina = await attivita(app, anna, "?filtro=follow");
      const voce = pagina.notifiche[0] as unknown as { followerId: string; tipo: string };

      expect(voce.tipo).toBe("follow_richiesta");
      expect(typeof voce.followerId).toBe("string");

      const accettata = await app.inject({
        headers: bearer(anna),
        method: "POST",
        url: `/api/v1/profile/followers/${voce.followerId}/accetta`,
      });

      expect(accettata.statusCode).toBe(204);

      // La stessa riga cambia faccia invece di sparire: adesso ti segue.
      expect((await attivita(app, anna, "?filtro=follow")).notifiche.map((n) => n.tipo)).toEqual([
        "follow_nuovo",
      ]);
    });
  });

  it("non esiste un modo di leggere l'attività di qualcun altro", async () => {
    await conDueMembri(async ({ app }) => {
      const senzaSessione = await app.inject({ method: "GET", url: "/api/v1/notifiche" });

      expect(senzaSessione.statusCode).toBe(401);
    });
  });
});
