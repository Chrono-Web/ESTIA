/**
 * An error with a stable machine-readable code and an HTTP status. Messages are
 * safe to return to the caller: they never carry credential material, and never
 * distinguish "unknown user" from "wrong password".
 */
export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
