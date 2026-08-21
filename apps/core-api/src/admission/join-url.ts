import type { FastifyRequest } from "fastify";

/**
 * Origin that outsiders should open for this invite.
 *
 * Taken from the Host (and optional forwarded proto) of the API request that
 * created the invite — i.e. how the browser reached **the instance**, not
 * how a Vite proxy rendered the admin UI on localhost. With
 * `changeOrigin: true` that Host is already the NAS address.
 */
export function joinUrlForInvite(request: FastifyRequest, code: string): string {
  const forwardedHost = headerFirst(request.headers["x-forwarded-host"]);
  const host = forwardedHost ?? request.headers.host ?? "localhost";
  const forwardedProto = headerFirst(request.headers["x-forwarded-proto"]);
  const proto = forwardedProto ?? (request.protocol === "https" ? "https" : "http");

  return `${proto}://${host}/entra?codice=${encodeURIComponent(code)}`;
}

function headerFirst(value: string | string[] | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(",")[0]?.trim();

  return first === "" || first === undefined ? undefined : first;
}
