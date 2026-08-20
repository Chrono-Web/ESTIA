import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
} from "node:crypto";
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

/**
 * Domain separation for the transport key. The version at the end is what
 * makes a future change possible: bumping it produces a different network
 * identity on purpose, instead of by accident.
 */
const NETWORK_KEY_INFO = "estia/identita-di-rete/ed25519/1";

const NETWORK_KEY_BYTES = 32;

/**
 * The instance's identity **on the network**, and it must never change.
 *
 * iroh addresses by public key: the `EndpointId` another instance saved is the
 * only thing it has to find this one again. Letting the transport generate its
 * own key at `bind()` — which is what it does when nobody gives it one — meant
 * every restart of the container produced a new instance as far as everyone
 * else was concerned, and every connection saved elsewhere pointed at a machine
 * that no longer existed. Stopping and starting an instance is not an event
 * that may cost it its network.
 *
 * So the key is **derived**, and derived rather than stored for a reason worth
 * writing down: `instance-identity.pem` is already the one file this instance
 * cannot afford to lose, already refused by ADR 0019 on data that does not
 * survive an update, and already inside every backup ([`service.ts`]). A second
 * key file would be a second thing to lose, absent from archives taken before
 * it existed. Derivation gives the property for free: restore an instance onto
 * a different NAS and it comes back with the same network identity.
 *
 * And derived rather than reused, which is the question ADR 0018 left open and
 * answered in the same breath — «la prudenza dice di derivarla». The instance
 * key signs at the application level; this one is the QUIC handshake identity.
 * HKDF with its own label keeps them separate, at no cost to either.
 */
export function deriveNetworkSecretKey(identity: InstanceIdentity): Uint8Array {
  const jwk = createPrivateKey(identity.privateKeyPem).export({ format: "jwk" }) as { d?: string };

  if (typeof jwk.d !== "string") {
    throw new Error("Unable to derive the instance network identity.");
  }

  // The raw Ed25519 seed: 32 bytes of the entropy drawn on first boot, which is
  // why the salt can be empty — HKDF needs one only to spread weak material.
  const seed = Buffer.from(jwk.d, "base64url");

  return new Uint8Array(
    hkdfSync("sha256", seed, new Uint8Array(0), NETWORK_KEY_INFO, NETWORK_KEY_BYTES),
  );
}
