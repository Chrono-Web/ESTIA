import type { ContentScope } from "@estia/contracts";

/**
 * Translation of the domain into ActivityStreams.
 *
 * This is the check ADR 0002 asks for, and the reason it is a **pure function**
 * matters more than the output: if the mapping can be written without reaching
 * into persistence, then the information federation needs is already in the
 * domain, and the feared retrofit is a translation job rather than a rewrite.
 *
 * Nothing here is wired to an endpoint. It exists to be true, and to be tested.
 */

export const PUBLIC_AUDIENCE = "https://www.w3.org/ns/activitystreams#Public";

export interface MappablePost {
  id: string;
  body: string;
  scope: ContentScope;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: { username: string };
}

export interface MappableComment {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  author: { username: string };
}

export interface ActivityStreamsObject {
  "@context": string;
  id: string;
  type: string;
  attributedTo: string;
  content?: string;
  published?: string;
  updated?: string;
  inReplyTo?: string;
  to: string[];
  cc: string[];
}

const CONTEXT = "https://www.w3.org/ns/activitystreams";

function actorOf(base: string, username: string): string {
  return `${base}/users/${username}`;
}

function objectOf(base: string, id: string): string {
  return `${base}/objects/${id}`;
}

/**
 * Addressing follows the scope, and the mapping is deliberately blunt about
 * the one case that matters: a `local` post is addressed to the instance's own
 * members and **never** to the public collection.
 */
function addressing(
  base: string,
  scope: ContentScope,
  username: string,
): { to: string[]; cc: string[] } {
  switch (scope) {
    case "public": {
      return { cc: [`${actorOf(base, username)}/followers`], to: [PUBLIC_AUDIENCE] };
    }
    case "followers": {
      return { cc: [], to: [`${actorOf(base, username)}/followers`] };
    }
    case "local": {
      return { cc: [], to: [`${base}/members`] };
    }
  }
}

export function postToNote(post: MappablePost, base: string): ActivityStreamsObject {
  // A deleted post becomes a tombstone rather than disappearing, which is why
  // the domain soft-deletes instead of removing rows.
  if (post.deletedAt !== null) {
    return {
      "@context": CONTEXT,
      attributedTo: actorOf(base, post.author.username),
      id: objectOf(base, post.id),
      type: "Tombstone",
      ...addressing(base, post.scope, post.author.username),
    };
  }

  return {
    "@context": CONTEXT,
    attributedTo: actorOf(base, post.author.username),
    content: post.body,
    id: objectOf(base, post.id),
    published: post.createdAt,
    type: "Note",
    ...(post.editedAt === null ? {} : { updated: post.editedAt }),
    ...addressing(base, post.scope, post.author.username),
  };
}

export function commentToNote(
  comment: MappableComment,
  parentScope: ContentScope,
  base: string,
): ActivityStreamsObject {
  return {
    "@context": CONTEXT,
    attributedTo: actorOf(base, comment.author.username),
    content: comment.body,
    id: objectOf(base, comment.id),
    inReplyTo: objectOf(base, comment.postId),
    published: comment.createdAt,
    type: "Note",
    // A reply inherits the reach of what it replies to: a comment on a
    // neighbourhood post must not become public on its own.
    ...addressing(base, parentScope, comment.author.username),
  };
}
