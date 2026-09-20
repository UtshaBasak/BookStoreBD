import type { Request, RequestHandler } from 'express';
import type { ZodError, ZodType } from 'zod';

import type { ValidationIssue } from '@shared/api.js';

/**
 * Validates `body`, `query` and `params` against Zod schemas and replaces them
 * with the parsed result, so handlers work with values whose shape and type are
 * already guaranteed.
 *
 * This is also what keeps query operators out of Mongoose: a schema that says
 * `z.string()` cannot yield `{ $ne: null }`.
 */
const SECTIONS = ['params', 'query', 'body'] as const;

type Section = (typeof SECTIONS)[number];

/** The schemas an endpoint declares. Any section left out is not touched. */
export type RequestSchemas = Partial<Record<Section, ZodType>>;

/**
 * Express 5 defines `req.query` as a getter, so a plain assignment to it is
 * silently discarded — validation would appear to work while handlers kept
 * reading the raw values. defineProperty is used for every section so all
 * three behave the same way.
 */
const replaceSection = (req: Request, section: Section, value: unknown): void => {
  Object.defineProperty(req, section, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
};

/** Turns Zod issues into a flat, predictable payload. */
export const formatIssues = (error: ZodError): ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (req, res, next) => {
    const errors: ValidationIssue[] = [];

    for (const section of SECTIONS) {
      const schema = schemas[section];
      if (!schema) continue;

      const result = schema.safeParse(req[section]);

      if (result.success) {
        replaceSection(req, section, result.data);
      } else {
        errors.push(
          ...formatIssues(result.error).map((issue) => ({
            ...issue,
            path: `${section}.${issue.path}`,
          }))
        );
      }
    }

    if (errors.length) {
      res.status(400).json({ message: 'Validation failed', errors });
      return;
    }

    return next();
  };

/**
 * Reads back a query that `validate` has already replaced.
 *
 * Express types `req.query` as strings, because a URL cannot carry anything
 * else. A schema that coerces `page` to a number therefore produces a value the
 * declaration says is impossible, so it is read through here rather than by
 * widening the request type and breaking the middleware chain's inference.
 */
export const validatedQuery = <T>(req: Request): T => req.query as unknown as T;

export default validate;
