import { createHash, randomInt } from "node:crypto";

/**
 * Alphabet without characters that get confused when copied by hand: no I, L,
 * O or U. These codes are read off a screen, written on paper or dictated over
 * the phone, then typed back later (ADR 0003, ADR 0009).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUP_LENGTH = 4;

/** Each group carries 20 bits, so `groups` × 20 bits of entropy. */
export function createReadableCode(groups: number): string {
  const chunks: string[] = [];

  for (let group = 0; group < groups; group++) {
    let chunk = "";

    for (let index = 0; index < GROUP_LENGTH; index++) {
      chunk += ALPHABET[randomInt(ALPHABET.length)];
    }

    chunks.push(chunk);
  }

  return chunks.join("-");
}

/**
 * Accepts what a person actually types: any casing, any grouping, and the two
 * transcription slips that matter. `O` and `I`/`L` are not in the alphabet, so
 * folding them onto `0` and `1` corrects a misreading without losing entropy.
 * Anything else that does not belong simply fails to match, which is correct.
 */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replaceAll(/[^0-9A-Z]/gu, "")
    .replaceAll("O", "0")
    .replaceAll(/[IL]/gu, "1");
}

/**
 * A fast hash is right here: these codes carry machine-generated entropy, so
 * there is no dictionary to slow down — the same reasoning that separates
 * session tokens from passwords in ADR 0008.
 */
export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code), "utf8").digest("hex");
}
