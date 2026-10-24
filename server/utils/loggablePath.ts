/**
 * A request's address as it may be written to a log: the path without its
 * query string, and with any segment that holds an e-mail address replaced.
 *
 * Query strings carry things a log must not: the one-time code and state
 * Google sends back to its callback, and the `?email=` some lookups use. A few
 * routes also take an address in the path (`/book/seller/<email>`). The route
 * is still recognisable from what is left, which is all a log reader needs.
 */
export const loggablePath = (url: string | undefined): string => {
  const [path = ''] = (url ?? '').split('?');
  return path
    .split('/')
    .map((segment) => (/@|%40/i.test(segment) ? '[email]' : segment))
    .join('/');
};

export default loggablePath;
