/**
 * A catch parameter is `unknown`, so the message has to be read rather than
 * assumed. Used by the handlers that answer with `{ message }`.
 */
export const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/** An Error carrying the status code the response should use. */
export interface HttpError extends Error {
    statusCode: number;
}

export const errorHandler = (statusCode: number, message: string): HttpError => {
    const error = new Error(message) as HttpError;
    error.statusCode = statusCode;
    return error;
};

/** A MongoDB unique-index violation, which arrives as a plain object. */
export interface DuplicateKeyError extends Error {
    code: number;
    keyPattern?: Record<string, unknown>;
}

/**
 * True for the error a unique index raises on a collision. The driver reports
 * it as code 11000 rather than as a distinguishable class, so the shape has to
 * be checked rather than the constructor.
 */
export const isDuplicateKeyError = (error: unknown): error is DuplicateKeyError =>
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000;
