/**
 * An error with a stable machine-readable code and an HTTP status. Messages are
 * safe to return to the caller: they never carry credential material, and never
 * distinguish "unknown user" from "wrong password".
 *
 * The client does not show the message: it shows its own sentence for the code,
 * in the reader's language, filled with `params` (ADR 0044 §5). The message
 * stays as the fallback for a client that does not know the code yet, so it
 * must still read as a sentence.
 */
export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    /** The values the client's sentence for this code needs. Never secrets. */
    public readonly params?: Readonly<Record<string, string | number>>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
