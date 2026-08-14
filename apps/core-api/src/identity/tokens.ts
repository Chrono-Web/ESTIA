import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session tokens are 256 bits of randomness, so a fast hash is the right tool
 * to store them — unlike passwords, which are low-entropy and need Argon2id
 * (ADR 0008). Guessing a token is infeasible, so there is nothing to slow down;
 * what matters is that the database never holds the usable value.
 */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison for values that must not leak through timing. */
export function secretsMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");

  // timingSafeEqual throws on a length mismatch, which would leak the length.
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}
