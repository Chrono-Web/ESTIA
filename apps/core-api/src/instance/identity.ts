import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const IDENTITY_FILE = "instance-identity.pem";

export interface InstanceIdentity {
  /** Base64url-encoded raw Ed25519 public key. This is the instance address. */
  publicKey: string;
  /** PEM-encoded private key. Never leaves this process. */
  privateKeyPem: string;
}

/**
 * Loads the instance identity, generating it on first boot.
 *
 * The private key lives in its own file rather than in the database, so that a
 * database dump does not carry the identity of the instance with it. ADR 0003
 * makes this keypair the permanent identity that members pin on first contact;
 * losing it means members no longer recognise the instance.
 */
export function loadOrCreateIdentity(dataDir: string): InstanceIdentity {
  mkdirSync(dataDir, { mode: 0o700, recursive: true });

  const identityPath = path.join(dataDir, IDENTITY_FILE);

  if (existsSync(identityPath)) {
    const privateKeyPem = readFileSync(identityPath, "utf8");
    return { privateKeyPem, publicKey: derivePublicKey(privateKeyPem) };
  }

  const { privateKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  // 0600: readable only by the user the instance runs as.
  writeFileSync(identityPath, privateKeyPem, { encoding: "utf8", mode: 0o600 });

  return { privateKeyPem, publicKey: derivePublicKey(privateKeyPem) };
}

function derivePublicKey(privateKeyPem: string): string {
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };

  if (typeof jwk.x !== "string") {
    throw new Error("Unable to derive the instance public key.");
  }

  // JWK already encodes the raw Ed25519 public key as base64url.
  return jwk.x;
}

/**
 * One-time token that authorises first-run setup.
 *
 * Being on the local network authenticates the channel, it does not authorise
 * the person (ADR 0003). Until M1.2 introduces real accounts, this token is
 * what stops anyone on the LAN from claiming an instance that is not theirs.
 * It is held in memory only, so a restart invalidates it.
 */
export function createSetupToken(): string {
  return randomBytes(24).toString("base64url");
}
