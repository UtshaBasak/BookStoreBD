const REGEX_SPECIAL_CHARS = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '/']);

/**
 * Escapes regex metacharacters in text that came from a request.
 *
 * Two reasons, and both have bitten. A search for "C++" is a syntax error as a
 * pattern rather than a search for "C++"; and a search for ".*" would
 * otherwise match every record there is, which is a filter doing the opposite
 * of filtering.
 */
export const escapeRegex = (value: string): string =>
  String(value)
    .split('')
    .map((char) => {
      if (char === String.fromCharCode(92)) return char + char;
      return REGEX_SPECIAL_CHARS.has(char) ? String.fromCharCode(92) + char : char;
    })
    .join('');

/** A case-insensitive "contains", for a search box. */
export const contains = (value: string): RegExp => new RegExp(escapeRegex(value), 'i');

/**
 * A case-insensitive exact match.
 *
 * Categories and conditions were stored with whatever capitalisation the form
 * of the day used - 'Fiction' from the current one, 'fiction' from the seed -
 * so an exact match on the stored value finds half of what it should.
 */
export const sameText = (value: string): RegExp => new RegExp(`^${escapeRegex(value)}$`, 'i');

export default escapeRegex;
