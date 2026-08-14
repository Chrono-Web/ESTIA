import { describe, expect, it } from "vitest";

import { commentToNote, postToNote, PUBLIC_AUDIENCE } from "./activitystreams.js";

const BASE = "https://quartiere.example";

const post = {
  author: { username: "anna" },
  body: "Domani mercatino in cortile.",
  createdAt: "2026-08-14T10:00:00.000Z",
  deletedAt: null,
  editedAt: null,
  id: "post-1",
  scope: "local" as const,
};

/**
 * ADR 0002 in practice. These tests never touch a database: if the mapping can
 * be written as a pure function over the domain, the information federation
 * will need is already there, and the retrofit the original plan feared is a
 * translation job rather than a rewrite.
 */
describe("mapping the domain to ActivityStreams", () => {
  it("turns a post into a Note without reading anything but the post", () => {
    expect(postToNote(post, BASE)).toEqual({
      "@context": "https://www.w3.org/ns/activitystreams",
      attributedTo: "https://quartiere.example/users/anna",
      cc: [],
      content: "Domani mercatino in cortile.",
      id: "https://quartiere.example/objects/post-1",
      published: "2026-08-14T10:00:00.000Z",
      to: ["https://quartiere.example/members"],
      type: "Note",
    });
  });

  it("never addresses a neighbourhood post to the public collection", () => {
    const note = postToNote(post, BASE);

    expect(note.to).not.toContain(PUBLIC_AUDIENCE);
    expect(note.cc).not.toContain(PUBLIC_AUDIENCE);
  });

  it("addresses each scope where it belongs", () => {
    expect(postToNote({ ...post, scope: "followers" }, BASE).to).toEqual([
      "https://quartiere.example/users/anna/followers",
    ]);

    const open = postToNote({ ...post, scope: "public" }, BASE);
    expect(open.to).toEqual([PUBLIC_AUDIENCE]);
    expect(open.cc).toEqual(["https://quartiere.example/users/anna/followers"]);
  });

  it("carries an edit as `updated`", () => {
    expect(postToNote({ ...post, editedAt: "2026-08-14T11:00:00.000Z" }, BASE).updated).toBe(
      "2026-08-14T11:00:00.000Z",
    );
  });

  it("turns a deleted post into a Tombstone rather than nothing", () => {
    const gone = postToNote({ ...post, deletedAt: "2026-08-14T12:00:00.000Z" }, BASE);

    expect(gone.type).toBe("Tombstone");
    expect(gone.id).toBe("https://quartiere.example/objects/post-1");
    // The body does not survive a deletion.
    expect(gone.content).toBeUndefined();
  });

  it("links a comment to what it replies to", () => {
    const note = commentToNote(
      {
        author: { username: "marco" },
        body: "Ci sono!",
        createdAt: "2026-08-14T10:30:00.000Z",
        id: "comment-1",
        postId: "post-1",
      },
      "local",
      BASE,
    );

    expect(note.inReplyTo).toBe("https://quartiere.example/objects/post-1");
    expect(note.type).toBe("Note");
  });

  it("gives a reply the reach of what it replies to, never more", () => {
    const comment = {
      author: { username: "marco" },
      body: "Ci sono!",
      createdAt: "2026-08-14T10:30:00.000Z",
      id: "comment-1",
      postId: "post-1",
    };

    // A comment on a neighbourhood post must not become public on its own.
    expect(commentToNote(comment, "local", BASE).to).toEqual(["https://quartiere.example/members"]);
    expect(commentToNote(comment, "public", BASE).to).toEqual([PUBLIC_AUDIENCE]);
  });
});
