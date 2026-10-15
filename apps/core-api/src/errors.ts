import { type CodiceErrore, traduci, type Valori } from "@estia/lingue";

/**
 * An error with a stable machine-readable code and an HTTP status. Messages are
 * safe to return to the caller: they never carry credential material, and never
 * distinguish "unknown user" from "wrong password".
 *
 * The code is what a person reads (ADR 0046 §3): the client shows the phrase
 * of `errori.<code>` in that person's language. So the code is typed against
 * the phrase table, and a code without a phrase does not compile. The message
 * is the English phrase, kept as the fallback for a client that does not know
 * the code yet.
 */
export class DomainError extends Error {
  public constructor(
    public readonly code: CodiceErrore,
    public readonly status: number,
    public readonly params?: Valori,
  ) {
    super(traduci("en", `errori.${code}`, params));
    this.name = "DomainError";
  }
}

/** The body of an error reply, as `ErrorResponse` declares it. */
export function errorBody(error: DomainError): {
  code: string;
  message: string;
  params?: Valori;
} {
  return {
    code: error.code,
    message: error.message,
    ...(error.params === undefined ? {} : { params: error.params }),
  };
}
