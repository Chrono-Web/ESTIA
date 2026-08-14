import { randomBytes } from "node:crypto";

import { argon2Verify, argon2id } from "hash-wasm";

/**
 * Argon2id parameters, from the OWASP minimum for this algorithm (ADR 0008).
 *
 * They are stored inside every hash in PHC form, so raising them later leaves
 * existing hashes verifiable. Changing them here changes only new hashes.
 */
export const ARGON2ID_PARAMETERS = {
  hashLength: 32,
  iterations: 2,
  memorySize: 19_456,
  parallelism: 1,
} as const;

/** Returns a PHC string that carries algorithm, parameters and salt. */
export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    outputType: "encoded",
    password,
    salt: randomBytes(16),
    ...ARGON2ID_PARAMETERS,
  });
}

/**
 * Verifies a password against a stored hash. Returns false rather than throwing
 * on a malformed hash, so a corrupted row cannot turn into a 500 that
 * distinguishes it from a wrong password.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ hash, password });
  } catch {
    return false;
  }
}
