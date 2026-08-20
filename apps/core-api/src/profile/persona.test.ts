import { loadConfig, type AppConfig } from "@estia/config";
import type { PersonView, TimelinePage } from "@estia/contracts";
import { withClosable, withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

/**
 * La pagina di una persona.
 *
 * Due cose sole la rendono diversa da un elenco di campi, e sono tutte e due
 * qui: la **relazione**, che è l'unico bit della lista dei follower che esce da
 * quella lista, e i **post nella lente corrente**, perché una pagina di profilo
 * non deve essere una scorciatoia attorno a un permesso.
 */

const SETUP_TOKEN = "token-di-prova";
const ADMIN = { password: "una-password-lunga", username: "anna" };

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

interface Prova {
  app: FastifyInstance;
  anna: string;
  marco: string;
}

async function withDue(use: (prova: Prova) => Promise<void>): Promise<void> {
  await withTempDataDir(async (dataDir) => {
    const app = await buildApp(configFor(dataDir), { setupToken: SETUP_TOKEN });

    await withClosable(app, async (instance) => {
      await instance.inject({
        method: "POST",
        payload: {
          adminPassword: ADMIN.password,
          adminUsername: ADMIN.username,
          name: "Via Roma",
          setupToken: SETUP_TOKEN,
        },
        url: "/api/v1/instance/setup",
      });

      await instance.identityService.createUser({
        displayName: "Marco Bianchi",
        password: "password-lunga-ok",
        role: "member",
        username: "marco",
      });

      const entra = async (username: string, password: string): Promise<string> =>
        (
          await instance.inject({
            method: "POST",
            payload: { password, username },
            url: "/api/v1/auth/login",
          })
        ).json().token as string;

      await use({
        anna: await entra(ADMIN.username, ADMIN.password),
        app: instance,
        marco: await entra("marco", "password-lunga-ok"),
      });
    });
  });
}

async function persona(app: FastifyInstance, token: string, chi: string): Promise<PersonView> {
  return (
    await app.inject({ headers: bearer(token), method: "GET", url: `/api/v1/profiles/${chi}` })
  ).json() as PersonView;
}

async function postDi(
  app: FastifyInstance,
  token: string,
  chi: string,
  feed: string,
): Promise<TimelinePage> {
  return (
    await app.inject({
      headers: bearer(token),
      method: "GET",
      url: `/api/v1/profiles/${chi}/posts?feed=${feed}`,
    })
  ).json() as TimelinePage;
}

describe("il profilo di una persona", () => {
  it("dice «sei tu» a chi guarda sé stesso, e mostra le sue scelte", async () => {
    await withDue(async ({ app, anna }) => {
      const mio = await persona(app, anna, "anna");

      expect(mio.relazione).toBe("sei_tu");
      expect(mio.presence).toBe("non_presente");
      expect(mio.openFollows).toBe(false);
    });
  });

  /**
   * Presenza e follow aperti sono decisioni di chi le prende, non fatti su di
   * lei: sul profilo di un altro non compaiono.
   */
  it("non mostra le scelte di qualcun altro", async () => {
    await withDue(async ({ app, anna }) => {
      const altro = await persona(app, anna, "marco");

      expect(altro.relazione).toBe("nessuna");
      expect(altro.presence).toBeUndefined();
      expect(altro.openFollows).toBeUndefined();
    });
  });

  it("segue la relazione da nessuna, ad attesa, a seguito", async () => {
    await withDue(async ({ app, anna, marco }) => {
      expect((await persona(app, anna, "marco")).relazione).toBe("nessuna");

      await app.inject({
        headers: bearer(anna),
        method: "POST",
        payload: { instanceKey: "locale", username: "marco" },
        url: "/api/v1/profile/follows",
      });

      expect((await persona(app, anna, "marco")).relazione).toBe("in_attesa");

      const { followers } = (
        await app.inject({
          headers: bearer(marco),
          method: "GET",
          url: "/api/v1/profile/follows",
        })
      ).json();

      await app.inject({
        headers: bearer(marco),
        method: "POST",
        url: `/api/v1/profile/followers/${followers[0].id}/accetta`,
      });

      expect((await persona(app, anna, "marco")).relazione).toBe("seguito");
      expect((await persona(app, anna, "marco")).followerCount).toBe(1);
    });
  });

  /**
   * Fuori le due metà del follow possono divergere, ed è voluto: stanno su due
   * macchine che si vedono a intermittenza. In casa stanno nello stesso
   * database, quindi una divergenza sarebbe solo un'attesa già finita mostrata
   * a chi ha chiesto.
   */
  it("in casa, accettare aggiorna anche la metà di chi ha chiesto", async () => {
    await withDue(async ({ app, anna, marco }) => {
      await app.inject({
        headers: bearer(anna),
        method: "POST",
        payload: { instanceKey: "locale", username: "marco" },
        url: "/api/v1/profile/follows",
      });

      const { followers } = (
        await app.inject({
          headers: bearer(marco),
          method: "GET",
          url: "/api/v1/profile/follows",
        })
      ).json();

      await app.inject({
        headers: bearer(marco),
        method: "POST",
        url: `/api/v1/profile/followers/${followers[0].id}/accetta`,
      });

      expect((await persona(app, anna, "anna")).followingCount).toBe(1);

      // E togliere il follower toglie anche il follow: la riga di chi seguiva
      // non ha più niente da autorizzare.
      await app.inject({
        headers: bearer(marco),
        method: "DELETE",
        url: `/api/v1/profile/followers/${followers[0].id}`,
      });

      expect((await persona(app, anna, "anna")).followingCount).toBe(0);
    });
  });

  it("conta solo i follower accettati, non le richieste", async () => {
    await withDue(async ({ app, anna }) => {
      await app.inject({
        headers: bearer(anna),
        method: "POST",
        payload: { instanceKey: "locale", username: "marco" },
        url: "/api/v1/profile/follows",
      });

      expect((await persona(app, anna, "marco")).followerCount).toBe(0);
    });
  });

  it("risponde «non esiste» per un nome che non c'è", async () => {
    await withDue(async ({ app, anna }) => {
      const risposta = await app.inject({
        headers: bearer(anna),
        method: "GET",
        url: "/api/v1/profiles/nessuno",
      });

      expect(risposta.statusCode).toBe(404);
    });
  });
});

describe("i post di una persona", () => {
  async function scrivi(
    app: FastifyInstance,
    token: string,
    body: string,
    scope?: string,
  ): Promise<void> {
    await app.inject({
      headers: bearer(token),
      method: "POST",
      payload: scope === undefined ? { body } : { body, scope },
      url: "/api/v1/posts",
    });
  }

  it("mostra i suoi, e solo i suoi", async () => {
    await withDue(async ({ app, anna, marco }) => {
      await scrivi(app, marco, "Cose di marco.");
      await scrivi(app, anna, "Cose di anna.");

      const pagina = await postDi(app, anna, "marco", "locale");

      expect(pagina.posts.map((post) => post.body)).toEqual(["Cose di marco."]);
    });
  });

  /**
   * La cosa che conta: la pagina di qualcuno non aggira il permesso. Se in
   * modalità rete non ti ha accettato, la sua pagina è vuota come il feed.
   */
  it("nella rete resta vuota finché quella persona non ti ha accettato", async () => {
    await withDue(async ({ app, anna, marco }) => {
      await scrivi(app, marco, "Roba di rete.", "followers");

      expect((await postDi(app, anna, "marco", "seguiti")).posts).toEqual([]);

      await app.inject({
        headers: bearer(anna),
        method: "POST",
        payload: { instanceKey: "locale", username: "marco" },
        url: "/api/v1/profile/follows",
      });

      const { followers } = (
        await app.inject({
          headers: bearer(marco),
          method: "GET",
          url: "/api/v1/profile/follows",
        })
      ).json();

      await app.inject({
        headers: bearer(marco),
        method: "POST",
        url: `/api/v1/profile/followers/${followers[0].id}/accetta`,
      });

      expect((await postDi(app, anna, "marco", "seguiti")).posts.map((p) => p.body)).toEqual([
        "Roba di rete.",
      ]);
    });
  });

  it("tiene le due lenti separate anche qui", async () => {
    await withDue(async ({ app, anna, marco }) => {
      await scrivi(app, marco, "In cortile.");
      await scrivi(app, marco, "Per chi mi segue.", "followers");

      expect((await postDi(app, anna, "marco", "locale")).posts.map((p) => p.body)).toEqual([
        "In cortile.",
      ]);
    });
  });
});
