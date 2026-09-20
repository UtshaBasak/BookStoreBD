/**
 * Request values reach Mongoose as whatever the body or query parser produced.
 * A JSON body of `{"email": {"$ne": null}}` — or a query string of
 * `?email[$ne]=null` — arrives as an object, so `User.findOne({ email })`
 * becomes `User.findOne({ email: { $ne: null } })` and matches every user
 * instead of one. Narrowing the value to a primitive string closes that off:
 * a string can never be interpreted as a query operator.
 */
export const asString = (value) => (typeof value === 'string' ? value : '');

/**
 * Same as asString, but trims surrounding whitespace. Use for identifiers that
 * are compared for equality, such as e-mail addresses and order numbers.
 */
export const asTrimmedString = (value) => asString(value).trim();

/**
 * Narrows a request value to a non-negative integer, or null when it is not
 * one. The typeof guard matters as much as the range check: without it an
 * object such as {"$gt": 0} would reach the update document.
 */
export const asNonNegativeInt = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};
