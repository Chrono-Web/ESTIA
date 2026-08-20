/**
 * The wire between two ESTIA instances, as decided in [ADR 0021].
 *
 * Four properties, and each one is a decision that was written down before this
 * file existed:
 *
 * - **the version is in the ALPN** (`estia/1`). An instance advertises every
 *   major it speaks, and QUIC negotiates. Incompatibility therefore fails at
 *   the handshake, cleanly, instead of failing later as data that parses and
 *   means something else.
 * - **one request and one response per bidirectional stream.** No correlation
 *   ids, no multiplexer, no queue of requests in flight — QUIC gives streams
 *   away, so concurrency costs nothing and a slow request delays nothing else.
 * - **the cap comes before the parse.** Never allocate in proportion to what
 *   the other side decided to send. Same rule ADR 0011 applies to images.
 * - **who is asking is never in the message.** It is the authenticated remote
 *   key of the connection, and nothing else — a field would be written by the
 *   caller, which is the mistake SECURITY_BASELINE §2 forbids for headers.
 */

import type { IrohStream } from "./endpoint.js";

/** The major version, on the wire. Advertise every major still spoken. */
export const PROTOCOL_ALPN = "estia/1";

export const SUPPORTED_ALPNS: readonly string[] = [PROTOCOL_ALPN];

/**
 * Control messages are small; these ceilings are deliberately far above what
 * this version sends and far below what would hurt. They are the reason an
 * unknown instance cannot make this one allocate.
 */
export const MAX_REQUEST_BYTES = 4096;
export const MAX_RESPONSE_BYTES = 4096;

/** How long a declared name may be before it is refused rather than truncated. */
export const MAX_NAME_LENGTH = 120;

export type RequestType = "presentazione" | "collegamento";

export interface PresentazioneRequest {
  tipo: "presentazione";
  /** What the calling instance calls itself. Declared, never verified — ADR 0020 §5. */
  nome: string;
}

export interface CollegamentoRequest {
  tipo: "collegamento";
  nome: string;
}

export type ProtocolRequest = PresentazioneRequest | CollegamentoRequest;

/**
 * How this instance sees the other one. Sent back so the far side can show a
 * relationship instead of guessing at it.
 *
 * `bloccata` is absent on purpose: a blocked instance is refused before any
 * request is read, so there is nobody to tell.
 */
export type RelationshipView =
  "sconosciuta" | "richiesta-inviata" | "richiesta-ricevuta" | "collegata";

export interface PresentazioneResponse {
  ok: true;
  nome: string;
  stato: RelationshipView;
}

export interface CollegamentoResponse {
  ok: true;
  stato: "in-attesa" | "collegata";
}

export interface ErrorResponse {
  ok: false;
  /** Stable, meant for the program. */
  codice: ErrorCode;
  /** A sentence, meant for a person. */
  messaggio: string;
}

/**
 * `richiesta_sconosciuta` is what makes ADR 0021 §6 work: a version that
 * gained a request type gets an orderly no from one that has not, rather than a
 * transport error.
 */
export type ErrorCode =
  "richiesta_sconosciuta" | "non_collegata" | "troppe_richieste" | "malformata" | "interna";

export type ProtocolResponse = PresentazioneResponse | CollegamentoResponse | ErrorResponse;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function errorResponse(codice: ErrorCode, messaggio: string): ErrorResponse {
  return { codice, messaggio, ok: false };
}

/** Writes one message and closes the writing half, which is what ends a request. */
export async function writeMessage(stream: IrohStream, message: unknown): Promise<void> {
  await stream.send.writeAll(Array.from(encoder.encode(JSON.stringify(message))));
  await stream.send.finish();
}

/**
 * Reads at most `limit` bytes and only then tries to make sense of them.
 *
 * Returns `undefined` rather than throwing on anything malformed: a caller
 * deciding what to do about a bad message should not also be handling
 * exceptions from three different layers.
 */
export async function readMessage(stream: IrohStream, limit: number): Promise<unknown | undefined> {
  try {
    const bytes = await stream.recv.readToEnd(limit);

    return JSON.parse(decoder.decode(Uint8Array.from(bytes)));
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A declared name, or nothing. Never throws, never truncates silently. */
function readName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const name = value.trim();

  return name.length === 0 || name.length > MAX_NAME_LENGTH ? undefined : name;
}

/**
 * Turns bytes that arrived from somebody unknown into one of the shapes this
 * version understands, or into the reason it could not.
 *
 * Unknown fields are ignored rather than refused (ADR 0021 §6): that is what
 * lets a later version add one without every house in Italy updating on the
 * same weekend.
 */
export function parseRequest(value: unknown): { request?: ProtocolRequest; error?: ErrorResponse } {
  if (!isRecord(value)) {
    return { error: errorResponse("malformata", "Il messaggio non è un oggetto JSON.") };
  }

  const nome = readName(value.nome);

  if (nome === undefined) {
    return {
      error: errorResponse(
        "malformata",
        `Manca il nome dell'istanza, oppure supera ${String(MAX_NAME_LENGTH)} caratteri.`,
      ),
    };
  }

  if (value.tipo === "presentazione" || value.tipo === "collegamento") {
    return { request: { nome, tipo: value.tipo } };
  }

  return {
    error: errorResponse(
      "richiesta_sconosciuta",
      "Questa istanza non conosce questo tipo di richiesta. Probabilmente parla una versione più vecchia del protocollo.",
    ),
  };
}
