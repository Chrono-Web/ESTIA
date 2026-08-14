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
});
