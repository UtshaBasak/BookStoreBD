/**
 * An HTTP failure, carrying the status alongside the message.
 *
 * A class rather than a property hung on a plain Error: `instanceof` is what
 * lets the retry policy and the pages that branch on 401 or 403 read the status
 * without guessing at the shape of whatever was thrown.
 */
export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

/** The status of a failed request, or 0 for anything that is not one. */
export const statusOf = (error: unknown): number =>
  error instanceof ApiRequestError ? error.status : 0;

/**
 * The message from anything thrown.
 *
 * A catch parameter is `unknown`, so reading `.message` off it is not something
 * the compiler will allow on trust.
 */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
