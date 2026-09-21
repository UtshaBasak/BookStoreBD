/**
 * Where a caught error goes.
 *
 * `console.error` at fifteen call sites meant fifteen messages in a visitor's
 * devtools on the live site - noise to them, and a few of them describing the
 * shape of a failed request. In development the console is exactly the right
 * place, so this keeps it there and goes quiet in a build.
 *
 * `import.meta.env.DEV` is replaced with a literal at build time, so the branch
 * below is removed from the bundle entirely rather than merely skipped.
 *
 * TODO(owner): the browser has no error reporting. Sentry's browser SDK would
 * slot in here, and this is the only place that would need to change.
 */
export const reportError = (context: string, error: unknown): void => {
  if (import.meta.env.DEV) {
    console.error(context, error);
  }
};

export default reportError;
