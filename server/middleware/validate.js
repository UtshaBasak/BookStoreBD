/**
 * Validates `body`, `query` and `params` against Zod schemas and replaces them
 * with the parsed result, so handlers work with values whose shape and type are
 * already guaranteed.
 *
 * This is also what keeps query operators out of Mongoose: a schema that says
 * `z.string()` cannot yield `{ $ne: null }`.
 */
const SECTIONS = ['params', 'query', 'body'];

/**
 * Express 5 defines `req.query` as a getter, so a plain assignment to it is
 * silently discarded — validation would appear to work while handlers kept
 * reading the raw values. defineProperty is used for every section so all
 * three behave the same way.
 */
const replaceSection = (req, section, value) => {
  Object.defineProperty(req, section, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
};

/** Turns Zod issues into a flat, predictable payload. */
export const formatIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

export const validate = (schemas) => (req, res, next) => {
  const errors = [];

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
    return res.status(400).json({ message: 'Validation failed', errors });
  }

  return next();
};

export default validate;
