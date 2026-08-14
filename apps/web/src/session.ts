import type { AuthenticatedUser } from "@estia/contracts";

const STORAGE_KEY = "estia.session";

export interface StoredSession {
  token: string;
  user: AuthenticatedUser;
}

/**
 * The session token lives in `localStorage`.
 *
 * It is a bearer token, not a cookie, and that is deliberate: nothing is sent
 * automatically with a request, so cross-site request forgery has nothing to
 * ride on. The cost is the mirror image — a script running on this page could
 * read the token — which is why the instance serves a strict content security
 * policy and the client never injects raw HTML.
 */
export function loadSession(): StoredSession | undefined {
  const raw = globalThis.localStorage?.getItem(STORAGE_KEY);

  if (raw === null || raw === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;

    return typeof parsed.token === "string" && parsed.user !== undefined
      ? { token: parsed.token, user: parsed.user }
      : undefined;
  } catch {
    return undefined;
  }
}

export function storeSession(session: StoredSession): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  globalThis.localStorage?.removeItem(STORAGE_KEY);
}
