import type { ValidationIssue } from '@shared/api.js';

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

// ---------------------------------------------------------------------------
// Rejected forms
//
// The API answers one with `{ message: 'Validation failed', errors: [{ path:
// 'body.pages', message: 'Invalid input' }] }` - it names the field. A page
// that shows only `message` turns that into "Submission failed: Validation
// failed", which tells somebody staring at a twelve-field form nothing at all,
// and there is no way to guess the rest.
// ---------------------------------------------------------------------------

interface ApiErrorBody {
  message?: string;
  error?: string;
  errors?: ValidationIssue[];
}

/** The body of an axios failure, for the pages that still use it. */
const asBody = (error: unknown): ApiErrorBody | undefined =>
  (error as { response?: { data?: ApiErrorBody } } | undefined)?.response?.data;

/**
 * `body.conditionDetails` becomes "Condition details".
 *
 * The section prefix is how the server distinguishes a bad body from a bad
 * query; it means nothing to the person filling in the form.
 */
export const fieldLabel = (path: string): string => {
  const name = path.replace(/^(body|query|params)\./, '').split('.').pop() ?? path;
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, (_, before: string, capital: string) => `${before} ${capital.toLowerCase()}`)
    .replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** The failed fields as one line, or an empty string when there are none. */
export const validationSummary = (error: unknown): string =>
  (asBody(error)?.errors ?? [])
    .map((issue) => `${fieldLabel(issue.path)} (${issue.message.toLowerCase()})`)
    .join(', ');

/**
 * The most useful sentence available for a failed request: the fields when the
 * server named them, its own message when it did not, and the fallback when
 * the request never reached it at all.
 */
export const apiErrorMessage = (error: unknown, fallback = 'Something went wrong'): string => {
  const fields = validationSummary(error);
  if (fields) return `please check ${fields}`;

  const body = asBody(error);
  return body?.message || body?.error || fallback;
};
