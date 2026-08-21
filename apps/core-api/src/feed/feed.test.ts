import { loadConfig, type AppConfig } from "@estia/config";
import { withTempDataDir } from "@estia/testing";
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import { openDatabase } from "../db/database.js";

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

interface Members {
  admin: string;
  anna: string;
  marco: string;
  moderator: string;
}

/** An instance with an administrator, a moderator and two ordinary members. */
async function withFeed(
  use: (context: { app: FastifyInstance; dataDir: string; token: Members }) => Promise<void>,
): Promise<void> {
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

      const signIn = async (username: string, password: string): Promise<string> => {
        const response = await app.inject({
          method: "POST",
          payload: { password, username },
          url: "/api/v1/auth/login",
        });

        return response.json().token;
      };

      for (const [username, role] of [
        ["anna", "member"],
        ["marco", "member"],
        ["mod", "instance_moderator"],
      ] as const) {
        await app.identityService.createUser({ password: "password-lunga-ok", role, username });
      }

      await use({
        app,
        dataDir,
        token: {
          admin: await signIn(ADMIN.username, ADMIN.password),
          anna: await signIn("anna", "password-lunga-ok"),
          marco: await signIn("marco", "password-lunga-ok"),
          moderator: await signIn("mod", "password-lunga-ok"),
        },
      });
    } finally {
      await app.close();
    }
  });
}

function post(app: FastifyInstance, token: string, body: string, scope?: string) {
  return app.inject({
    headers: bearer(token),
    method: "POST",
    payload: scope === undefined ? { body } : { body, scope },
    url: "/api/v1/posts",
  });
}

function timeline(app: FastifyInstance, token: string, query = "") {
  return app.inject({ headers: bearer(token), method: "GET", url: `/api/v1/posts${query}` });
}

describe("posting", () => {
  it("defaults to the neighbourhood, never to the world", async () => {
    await withFeed(async ({ app, token }) => {
      const created = await post(app, token.anna, "Domani mercatino in cortile.");

      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({
        author: { username: "anna" },
        body: "Domani mercatino in cortile.",
        commentCount: 0,
        likeCount: 0,
        liked: false,
        scope: "local",
      });
    });
  });

  it("stores the default scope in the database as well, not only in the answer", async () => {
    await withFeed(async ({ app, dataDir, token }) => {
      await post(app, token.anna, "Un post qualunque.");

      const database = openDatabase(dataDir);

      try {
        const rows = database.prepare("SELECT scope FROM posts").all() as { scope: string }[];

        expect(rows.map((row) => row.scope)).toEqual(["local"]);
      } finally {
        database.close();
      }
    });
  });

  it("honours an explicit scope", async () => {
    await withFeed(async ({ app, token }) => {
      expect((await post(app, token.anna, "Ciao mondo", "public")).json().scope).toBe("public");
    });
  });

  it("refuses a post made of nothing but spaces", async () => {
    await withFeed(async ({ app, token }) => {
      expect((await post(app, token.anna, "     ")).statusCode).toBe(400);
    });
  });

  it("is closed to anyone without a live session", async () => {
    await withFeed(async ({ app, token }) => {
      expect((await app.inject({ method: "GET", url: "/api/v1/posts" })).statusCode).toBe(401);

      // A revoked session loses the feed at once.
      await app.inject({
        headers: bearer(token.anna),
        method: "POST",
        url: "/api/v1/auth/logout",
      });

      expect((await timeline(app, token.anna)).statusCode).toBe(401);
    });
  });
});

describe("timeline", () => {
  it("is chronological, newest first, with no ranking", async () => {
    await withFeed(async ({ app, token }) => {
      for (const body of ["primo", "secondo", "terzo"]) {
        await post(app, token.anna, body);
      }

      const bodies = (await timeline(app, token.marco))
        .json()
        .posts.map((entry: { body: string }) => entry.body);

      expect(bodies).toEqual(["terzo", "secondo", "primo"]);
    });
  });

  it("pages without losing or repeating a post", async () => {
    await withFeed(async ({ app, token }) => {
      for (let index = 0; index < 7; index++) {
        await post(app, token.anna, `post ${index}`);
      }

      const first = (await timeline(app, token.anna, "?limit=3")).json();
      expect(first.posts).toHaveLength(3);
      expect(first.nextCursor).toBeTypeOf("string");

      const second = (
        await timeline(app, token.anna, `?limit=3&cursor=${encodeURIComponent(first.nextCursor)}`)
      ).json();
      const third = (
        await timeline(app, token.anna, `?limit=3&cursor=${encodeURIComponent(second.nextCursor)}`)
      ).json();

      const seen = [...first.posts, ...second.posts, ...third.posts].map(
        (entry: { id: string }) => entry.id,
      );

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      expect(third.nextCursor).toBeUndefined();
    });
  });

  it("drops a deleted post from everyone's timeline", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Poi ci ripenso.")).json();

      const removed = await app.inject({
        headers: bearer(token.anna),
        method: "DELETE",
        url: `/api/v1/posts/${created.id}`,
      });
      expect(removed.statusCode).toBe(204);

      expect((await timeline(app, token.marco)).json().posts).toHaveLength(0);
    });
  });
});

describe("who may remove what", () => {
  it("lets an author delete their own post and no one else's", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Roba mia.")).json();

      const intruder = await app.inject({
        headers: bearer(token.marco),
        method: "DELETE",
        url: `/api/v1/posts/${created.id}`,
      });

      expect(intruder.statusCode).toBe(403);
      expect((await timeline(app, token.anna)).json().posts).toHaveLength(1);
    });
  });

  it("lets a moderator remove a post that is not theirs", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Qualcosa da moderare.")).json();

      const removed = await app.inject({
        headers: bearer(token.moderator),
        method: "DELETE",
        url: `/api/v1/posts/${created.id}`,
      });

      expect(removed.statusCode).toBe(204);
    });
  });

  it("keeps hiding a post away from ordinary members", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Da nascondere.")).json();

      const denied = await app.inject({
        headers: bearer(token.marco),
        method: "POST",
        payload: { hidden: true },
        url: `/api/v1/posts/${created.id}/hidden`,
      });

      expect(denied.statusCode).toBe(403);
    });
  });

  it("empties a hidden post for others but keeps it for its author", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Testo discutibile.")).json();

      await app.inject({
        headers: bearer(token.moderator),
        method: "POST",
        payload: { hidden: true },
        url: `/api/v1/posts/${created.id}/hidden`,
      });

      const asStranger = (await timeline(app, token.marco)).json().posts[0];
      const asAuthor = (await timeline(app, token.anna)).json().posts[0];

      // The post keeps its place so that the replies do not dangle, but its
      // body is gone for whoever it was hidden from.
      expect(asStranger).toMatchObject({ body: "", hidden: true });
      expect(asAuthor).toMatchObject({ body: "Testo discutibile.", hidden: true });
    });
  });
});

describe("likes", () => {
  it("counts once however many times it is pressed", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Mi piace questo.")).json();

      for (let index = 0; index < 3; index++) {
        await app.inject({
          headers: bearer(token.marco),
          method: "PUT",
          url: `/api/v1/posts/${created.id}/like`,
        });
      }

      const liked = await app.inject({
        headers: bearer(token.marco),
        method: "PUT",
        url: `/api/v1/posts/${created.id}/like`,
      });

      expect(liked.json()).toEqual({ likeCount: 1, liked: true });

      const removed = await app.inject({
        headers: bearer(token.marco),
        method: "DELETE",
        url: `/api/v1/posts/${created.id}/like`,
      });

      expect(removed.json()).toEqual({ likeCount: 0, liked: false });
    });
  });

  it("tells each person about their own like, not someone else's", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Chi c'è?")).json();

      await app.inject({
        headers: bearer(token.marco),
        method: "PUT",
        url: `/api/v1/posts/${created.id}/like`,
      });

      expect((await timeline(app, token.marco)).json().posts[0]).toMatchObject({
        likeCount: 1,
        liked: true,
      });
      expect((await timeline(app, token.anna)).json().posts[0]).toMatchObject({
        likeCount: 1,
        liked: false,
      });
    });
  });

  it("does not reorder the timeline", async () => {
    await withFeed(async ({ app, token }) => {
      const first = (await post(app, token.anna, "primo")).json();
      await post(app, token.anna, "secondo");

      await app.inject({
        headers: bearer(token.marco),
        method: "PUT",
        url: `/api/v1/posts/${first.id}/like`,
      });

      // No ranking: a liked post does not climb (PRODUCT_VISION §3).
      expect(
        (await timeline(app, token.marco))
          .json()
          .posts.map((entry: { body: string }) => entry.body),
      ).toEqual(["secondo", "primo"]);
    });
  });
});

describe("comments", () => {
  it("keeps them in the order they were written", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Chi viene al mercatino?")).json();

      for (const [who, body] of [
        [token.marco, "Io!"],
        [token.anna, "Bene, ci vediamo lì."],
      ] as const) {
        const added = await app.inject({
          headers: bearer(who),
          method: "POST",
          payload: { body },
          url: `/api/v1/posts/${created.id}/comments`,
        });
        expect(added.statusCode).toBe(201);
      }

      const list = await app.inject({
        headers: bearer(token.marco),
        method: "GET",
        url: `/api/v1/posts/${created.id}/comments`,
      });

      expect(list.json().comments.map((entry: { body: string }) => entry.body)).toEqual([
        "Io!",
        "Bene, ci vediamo lì.",
      ]);

      expect((await timeline(app, token.anna)).json().posts[0].commentCount).toBe(2);
    });
  });

  it("lets an author remove their comment and refuses a stranger", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Un post.")).json();
      const comment = (
        await app.inject({
          headers: bearer(token.marco),
          method: "POST",
          payload: { body: "Un commento." },
          url: `/api/v1/posts/${created.id}/comments`,
        })
      ).json();

      const intruder = await app.inject({
        headers: bearer(token.anna),
        method: "DELETE",
        url: `/api/v1/comments/${comment.id}`,
      });
      expect(intruder.statusCode).toBe(403);

      const own = await app.inject({
        headers: bearer(token.marco),
        method: "DELETE",
        url: `/api/v1/comments/${comment.id}`,
      });
      expect(own.statusCode).toBe(204);

      expect((await timeline(app, token.anna)).json().posts[0].commentCount).toBe(0);
    });
  });

  it("refuses to comment on something that is not there", async () => {
    await withFeed(async ({ app, token }) => {
      const response = await app.inject({
        headers: bearer(token.anna),
        method: "POST",
        payload: { body: "Ciao?" },
        url: "/api/v1/posts/non-esiste/comments",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  it("lets the author edit, a moderator hide, and anyone like a comment", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Un avviso.")).json();
      const comment = (
        await app.inject({
          headers: bearer(token.marco),
          method: "POST",
          payload: { body: "Prima versione." },
          url: `/api/v1/posts/${created.id}/comments`,
        })
      ).json();

      const edited = await app.inject({
        headers: bearer(token.marco),
        method: "PATCH",
        payload: { body: "Versione corretta." },
        url: `/api/v1/comments/${comment.id}`,
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toMatchObject({
        body: "Versione corretta.",
        canEdit: true,
        editedAt: expect.any(String),
      });

      const liked = await app.inject({
        headers: bearer(token.anna),
        method: "PUT",
        url: `/api/v1/comments/${comment.id}/like`,
      });
      expect(liked.json()).toEqual({ likeCount: 1, liked: true });

      const hidden = await app.inject({
        headers: bearer(token.moderator),
        method: "POST",
        payload: { hidden: true },
        url: `/api/v1/comments/${comment.id}/hidden`,
      });
      expect(hidden.statusCode).toBe(200);
      expect(hidden.json().hidden).toBe(true);
      // Il moderatore legge ancora il testo: altrimenti non saprebbe che cosa ha nascosto.
      expect(hidden.json().body).toBe("Versione corretta.");

      const asAuthor = await app.inject({
        headers: bearer(token.marco),
        method: "GET",
        url: `/api/v1/posts/${created.id}/comments`,
      });
      expect(asAuthor.json().comments[0].body).toBe("Versione corretta.");

      const asStranger = await app.inject({
        headers: bearer(token.anna),
        method: "GET",
        url: `/api/v1/posts/${created.id}/comments`,
      });
      expect(asStranger.json().comments[0]).toMatchObject({ body: "", hidden: true });
    });
  });

  it("keeps each reply under the comment it answers, recursively", async () => {
    await withFeed(async ({ app, token }) => {
      const created = (await post(app, token.anna, "Domanda.")).json();
      const root = (
        await app.inject({
          headers: bearer(token.marco),
          method: "POST",
          payload: { body: "Risposta." },
          url: `/api/v1/posts/${created.id}/comments`,
        })
      ).json();
      const child = (
        await app.inject({
          headers: bearer(token.anna),
          method: "POST",
          payload: { body: "Grazie.", parentId: root.id },
          url: `/api/v1/posts/${created.id}/comments`,
        })
      ).json();
      const nested = (
        await app.inject({
          headers: bearer(token.marco),
          method: "POST",
          payload: { body: "Di niente.", parentId: child.id },
          url: `/api/v1/posts/${created.id}/comments`,
        })
      ).json();

      expect(child.parentId).toBe(root.id);
      expect(nested.parentId).toBe(child.id);
    });
  });
});

/**
 * I due feed, e la regola che li tiene separati.
 *
 * Non è un filtro sopra un elenco unico: un post sta nell'istanza **oppure**
 * nella rete, mai in tutti e due. È l'invariante di ADR 0002 reso struttura, e
 * il motivo per cui il feed locale non può essere federato per sbaglio.
 */
describe("i due feed", () => {
  async function segui(
    app: FastifyInstance,
    chiSegue: string,
    chiVieneSeguito: string,
  ): Promise<void> {
    await app.inject({
      headers: bearer(chiSegue),
      method: "POST",
      payload: { instanceKey: "locale", username: chiVieneSeguito },
      url: "/api/v1/profile/follows",
    });
  }

  async function accettaTutti(app: FastifyInstance, token: string): Promise<void> {
    const { followers } = (
      await app.inject({ headers: bearer(token), method: "GET", url: "/api/v1/profile/follows" })
    ).json();

    for (const richiesta of followers) {
      await app.inject({
        headers: bearer(token),
        method: "POST",
        url: `/api/v1/profile/followers/${richiesta.id}/accetta`,
      });
    }
  }

  it("tiene un post in un feed solo", async () => {
    await withFeed(async ({ app, token }) => {
      await post(app, token.anna, "Mercatino in cortile.");
      await post(app, token.anna, "Una cosa per chi mi segue.", "followers");

      const locale = (await timeline(app, token.anna, "?feed=locale")).json();
      const rete = (await timeline(app, token.anna, "?feed=seguiti")).json();

      expect(locale.posts.map((row: { body: string }) => row.body)).toEqual([
        "Mercatino in cortile.",
      ]);
      expect(rete.posts.map((row: { body: string }) => row.body)).toEqual([
        "Una cosa per chi mi segue.",
      ]);
    });
  });

  it("legge quello dell'istanza a chi non chiede niente", async () => {
    await withFeed(async ({ app, token }) => {
      await post(app, token.anna, "Fuori dalla rete.", "followers");
      await post(app, token.anna, "In cortile.");

      expect((await timeline(app, token.anna)).json().posts).toHaveLength(1);
      expect((await timeline(app, token.anna)).json().posts[0].body).toBe("In cortile.");
    });
  });

  it("mostra nella rete solo chi ha accettato, e non chi ci sta pensando", async () => {
    await withFeed(async ({ app, token }) => {
      await post(app, token.marco, "Post di rete di marco.", "followers");
      await segui(app, token.anna, "marco");

      // Il profilo è chiuso per default: la richiesta resta in attesa, e una
      // richiesta non è un permesso.
      expect((await timeline(app, token.anna, "?feed=seguiti")).json().posts).toHaveLength(0);

      await accettaTutti(app, token.marco);

      const dopo = (await timeline(app, token.anna, "?feed=seguiti")).json();

      expect(dopo.posts.map((row: { body: string }) => row.body)).toEqual([
        "Post di rete di marco.",
      ]);
    });
  });

  /**
   * La proprietà che ADR 0022 promette: la lista che autorizza sta in casa di
   * chi è seguito, quindi la revoca non deve viaggiare per avere effetto.
   */
  it("toglie i post dal feed nel momento in cui si toglie il follower", async () => {
    await withFeed(async ({ app, token }) => {
      await post(app, token.marco, "Post di rete di marco.", "followers");
      await segui(app, token.anna, "marco");
      await accettaTutti(app, token.marco);

      const { followers } = (
        await app.inject({
          headers: bearer(token.marco),
          method: "GET",
          url: "/api/v1/profile/follows",
        })
      ).json();

      await app.inject({
        headers: bearer(token.marco),
        method: "DELETE",
        url: `/api/v1/profile/followers/${followers[0].id}`,
      });

      expect((await timeline(app, token.anna, "?feed=seguiti")).json().posts).toHaveLength(0);
    });
  });

  it("mostra a ognuno i propri post di rete, senza bisogno di seguirsi", async () => {
    await withFeed(async ({ app, token }) => {
      await post(app, token.anna, "Roba mia.", "followers");

      expect((await timeline(app, token.anna, "?feed=seguiti")).json().posts).toHaveLength(1);
      expect((await timeline(app, token.marco, "?feed=seguiti")).json().posts).toHaveLength(0);
    });
  });

  it("pagina i due feed indipendentemente", async () => {
    await withFeed(async ({ app, token }) => {
      for (let index = 0; index < 3; index += 1) {
        await post(app, token.anna, `Locale ${String(index)}`);
        await post(app, token.anna, `Rete ${String(index)}`, "followers");
      }

      const prima = (await timeline(app, token.anna, "?feed=seguiti&limit=2")).json();

      expect(prima.posts).toHaveLength(2);
      expect(prima.nextCursor).toBeDefined();

      const seconda = (
        await timeline(
          app,
          token.anna,
          `?feed=seguiti&cursor=${encodeURIComponent(prima.nextCursor)}`,
        )
      ).json();

      expect(seconda.posts).toHaveLength(1);
      expect(
        [...prima.posts, ...seconda.posts].every((row: { scope: string }) => row.scope !== "local"),
      ).toBe(true);
    });
  });

  it("rifiuta un feed che non esiste invece di indovinarlo", async () => {
    await withFeed(async ({ app, token }) => {
      expect((await timeline(app, token.anna, "?feed=tutto")).statusCode).toBe(400);
    });
  });
});

/**
 * Un post di rete non si legge aprendone l'indirizzo.
 *
 * Il feed filtrava e la lettura per identificatore no: due scritture della
 * stessa regola, e sono divergute. Da qui la condizione vive in un posto solo,
 * e queste prove la tengono ferma dove si era rotta.
 */
describe("il permesso di leggere un post", () => {
  it("nega a chi non è stato accettato, e dice «non esiste» invece di «non puoi»", async () => {
    await withFeed(async ({ app, token }) => {
      const riservato = (await post(app, token.anna, "Solo per chi mi segue.", "followers")).json();
      // marco non segue anna, e non le ha mai chiesto niente.
      const estraneo = token.marco;

      const letto = await app.inject({
        headers: bearer(estraneo),
        method: "GET",
        url: `/api/v1/posts/${riservato.id}`,
      });

      // 404 e non 403: distinguere le due risposte direbbe, un indirizzo per
      // volta, chi ha scritto che cosa.
      expect(letto.statusCode).toBe(404);
      expect(letto.json().code).toBe("post_not_found");
    });
  });

  it("nega anche di commentarlo, di leggerne i commenti e di metterci mi piace", async () => {
    await withFeed(async ({ app, token }) => {
      const riservato = (await post(app, token.anna, "Solo per chi mi segue.", "followers")).json();
      // marco non segue anna, e non le ha mai chiesto niente.
      const estraneo = token.marco;
      const url = `/api/v1/posts/${riservato.id}`;

      expect(
        (
          await app.inject({
            headers: bearer(estraneo),
            method: "POST",
            payload: { body: "Ci sono anche io" },
            url: `${url}/comments`,
          })
        ).statusCode,
      ).toBe(404);

      expect(
        (await app.inject({ headers: bearer(estraneo), method: "GET", url: `${url}/comments` }))
          .statusCode,
      ).toBe(404);

      expect(
        (await app.inject({ headers: bearer(estraneo), method: "PUT", url: `${url}/like` }))
          .statusCode,
      ).toBe(404);
    });
  });

  it("nega di toccare un commento dentro una conversazione che non si può leggere", async () => {
    await withFeed(async ({ app, token }) => {
      const riservato = (await post(app, token.anna, "Solo per chi mi segue.", "followers")).json();
      const commento = (
        await app.inject({
          headers: bearer(token.anna),
          method: "POST",
          payload: { body: "Un commento mio" },
          url: `/api/v1/posts/${riservato.id}/comments`,
        })
      ).json();
      // marco non segue anna, e non le ha mai chiesto niente.
      const estraneo = token.marco;

      expect(
        (
          await app.inject({
            headers: bearer(estraneo),
            method: "PUT",
            url: `/api/v1/comments/${commento.id}/like`,
          })
        ).statusCode,
      ).toBe(404);
    });
  });

  it("lo concede a chi l'autore ha accettato, e all'autore", async () => {
    await withFeed(async ({ app, token }) => {
      const riservato = (await post(app, token.anna, "Solo per chi mi segue.", "followers")).json();

      await app.inject({
        headers: bearer(token.marco),
        method: "POST",
        payload: { instanceKey: "locale", username: "anna" },
        url: "/api/v1/profile/follows",
      });

      const { followers } = (
        await app.inject({
          headers: bearer(token.anna),
          method: "GET",
          url: "/api/v1/profile/follows",
        })
      ).json();

      await app.inject({
        headers: bearer(token.anna),
        method: "POST",
        url: `/api/v1/profile/followers/${followers[0].id}/accetta`,
      });

      for (const chi of [token.marco, token.anna]) {
        const letto = await app.inject({
          headers: bearer(chi),
          method: "GET",
          url: `/api/v1/posts/${riservato.id}`,
        });

        expect(letto.statusCode).toBe(200);
        expect(letto.json().body).toBe("Solo per chi mi segue.");
      }
    });
  });

  /**
   * Il permesso non deve rendere immoderabile la superficie di rete: chi
   * modera interviene anche su ciò che non gli era destinato, ed è la stessa
   * fiducia che il codice gli accorda già sui contenuti nascosti.
   */
  it("lascia comunque moderare chi modera", async () => {
    await withFeed(async ({ app, token }) => {
      const riservato = (await post(app, token.anna, "Solo per chi mi segue.", "followers")).json();

      const nascosto = await app.inject({
        headers: bearer(token.moderator),
        method: "POST",
        payload: { hidden: true },
        url: `/api/v1/posts/${riservato.id}/hidden`,
      });

      expect(nascosto.statusCode).toBe(200);
      expect(nascosto.json().hidden).toBe(true);

      const eliminato = await app.inject({
        headers: bearer(token.moderator),
        method: "DELETE",
        url: `/api/v1/posts/${riservato.id}`,
      });

      expect(eliminato.statusCode).toBe(204);
    });
  });
});

/**
 * Eliminare un commento non deve staccare le sue risposte dall'albero.
 *
 * Restavano nel database e nel conteggio, e nessuna interfaccia le raggiungeva
 * più — nemmeno per moderarle. Adesso l'eliminato resta come lapide, se e solo
 * se regge ancora qualcosa.
 */
describe("un commento eliminato che aveva risposte", () => {
  async function commenta(
    app: FastifyInstance,
    token: string,
    postId: string,
    body: string,
    parentId?: string,
  ): Promise<{ id: string }> {
    return (
      await app.inject({
        headers: bearer(token),
        method: "POST",
        payload: parentId === undefined ? { body } : { body, parentId },
        url: `/api/v1/posts/${postId}/comments`,
      })
    ).json();
  }

  function commenti(app: FastifyInstance, token: string, postId: string) {
    return app.inject({
      headers: bearer(token),
      method: "GET",
      url: `/api/v1/posts/${postId}/comments`,
    });
  }

  it("resta come lapide, e le risposte restano raggiungibili", async () => {
    await withFeed(async ({ app, token }) => {
      const scritto = (await post(app, token.anna, "Un post")).json();
      const padre = await commenta(app, token.anna, scritto.id, "Il padre");

      await commenta(app, token.marco, scritto.id, "Prima risposta", padre.id);
      await commenta(app, token.marco, scritto.id, "Seconda risposta", padre.id);

      await app.inject({
        headers: bearer(token.anna),
        method: "DELETE",
        url: `/api/v1/comments/${padre.id}`,
      });

      const elenco = (await commenti(app, token.anna, scritto.id)).json().comments;
      const lapide = elenco.find((riga: { id: string }) => riga.id === padre.id);

      expect(lapide).toMatchObject({ body: "", canDelete: false, canEdit: false, deleted: true });
      expect(elenco.filter((riga: { deleted: boolean }) => !riga.deleted)).toHaveLength(2);

      // Nessuna risposta resta senza il proprio padre nell'elenco: è la
      // condizione che rende l'albero disegnabile senza perdere rami.
      const orfani = elenco.filter(
        (riga: { parentId: string | null }) =>
          riga.parentId !== null &&
          !elenco.some((altro: { id: string }) => altro.id === riga.parentId),
      );

      expect(orfani).toEqual([]);
    });
  });

  it("tiene su una catena intera di eliminati, non solo l'ultimo", async () => {
    await withFeed(async ({ app, token }) => {
      const scritto = (await post(app, token.anna, "Un post")).json();
      const nonno = await commenta(app, token.anna, scritto.id, "Nonno");
      const padre = await commenta(app, token.anna, scritto.id, "Padre", nonno.id);

      await commenta(app, token.marco, scritto.id, "Nipote vivo", padre.id);

      for (const id of [nonno.id, padre.id]) {
        await app.inject({
          headers: bearer(token.anna),
          method: "DELETE",
          url: `/api/v1/comments/${id}`,
        });
      }

      const elenco = (await commenti(app, token.anna, scritto.id)).json().comments;

      expect(elenco).toHaveLength(3);
      expect(elenco.filter((riga: { deleted: boolean }) => riga.deleted)).toHaveLength(2);
    });
  });

  it("sparisce del tutto quando non regge più niente", async () => {
    await withFeed(async ({ app, token }) => {
      const scritto = (await post(app, token.anna, "Un post")).json();
      const solitario = await commenta(app, token.anna, scritto.id, "Nessuno mi ha risposto");

      await app.inject({
        headers: bearer(token.anna),
        method: "DELETE",
        url: `/api/v1/comments/${solitario.id}`,
      });

      expect((await commenti(app, token.anna, scritto.id)).json().comments).toEqual([]);
    });
  });

  it("non lascia rispondere a una lapide", async () => {
    await withFeed(async ({ app, token }) => {
      const scritto = (await post(app, token.anna, "Un post")).json();
      const padre = await commenta(app, token.anna, scritto.id, "Il padre");

      await commenta(app, token.marco, scritto.id, "Una risposta", padre.id);
      await app.inject({
        headers: bearer(token.anna),
        method: "DELETE",
        url: `/api/v1/comments/${padre.id}`,
      });

      const risposta = await app.inject({
        headers: bearer(token.marco),
        method: "POST",
        payload: { body: "Provo a rispondere a un morto", parentId: padre.id },
        url: `/api/v1/posts/${scritto.id}/comments`,
      });

      expect(risposta.statusCode).toBe(404);
    });
  });
});
