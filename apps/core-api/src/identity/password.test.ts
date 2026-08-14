import { argon2id } from "hash-wasm";
import { describe, expect, it } from "vitest";

import { ARGON2ID_PARAMETERS, hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("matches an independent Argon2id implementation", async () => {
    // Known-answer test. The expected digest was obtained on 2026-08-14 by
    // running hash-wasm and @node-rs/argon2 — which wraps the RustCrypto
    // implementation — over the same input: the two agreed byte for byte
    // (ADR 0008). It guards against a library regression and, above all,
    // against an accidental change of the parameters, which would otherwise
    // pass unnoticed.
    const digest = await argon2id({
      hashLength: 32,
      iterations: ARGON2ID_PARAMETERS.iterations,
      memorySize: ARGON2ID_PARAMETERS.memorySize,
      outputType: "hex",
      parallelism: ARGON2ID_PARAMETERS.parallelism,
      password: "password-di-prova",
      salt: Buffer.from("0123456789abcdef", "utf8"),
    });

    expect(digest).toBe("e50bd6b45edfffe24632af560e7c5a3508dc3b9fac8f273ca17f405f77c034ec");
  });

  it("uses the OWASP minimum parameters for Argon2id", () => {
    expect(ARGON2ID_PARAMETERS).toEqual({
      hashLength: 32,
      iterations: 2,
      memorySize: 19_456,
      parallelism: 1,
    });
  });

  it("produces a PHC hash that carries its own parameters", async () => {
    const hash = await hashPassword("una password lunga abbastanza");

    expect(hash.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
  });

  it("salts every hash, so identical passwords differ", async () => {
    const [a, b] = await Promise.all([
      hashPassword("stessa password"),
      hashPassword("stessa password"),
    ]);

    expect(a).not.toBe(b);
    expect(await verifyPassword("stessa password", a)).toBe(true);
    expect(await verifyPassword("stessa password", b)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("quella giusta");

    expect(await verifyPassword("quella sbagliata", hash)).toBe(false);
  });

  it("returns false instead of throwing on a corrupted hash", async () => {
    expect(await verifyPassword("qualunque", "non-e-un-hash")).toBe(false);
    expect(await verifyPassword("qualunque", "")).toBe(false);
  });
});
