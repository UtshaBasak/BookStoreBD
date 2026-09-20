import { z } from 'zod';

/**
 * Building blocks shared by the per-domain schemas.
 *
 * Every one of these narrows to a primitive. That is what stops a JSON body of
 * `{"email": {"$ne": null}}` reaching a Mongoose query as an operator object.
 */

/** A 24-character hex MongoDB ObjectId. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

/**
 * Trim and lower-case before validating, not after: `z.email().trim()` runs the
 * check against the raw string, so a pasted address with a trailing space is
 * rejected even though it is perfectly valid.
 */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Must be a valid email address').max(254));

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

export const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(40);

/** Six digits, as issued by the OTP generator. */
export const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Code must be six digits');

/**
 * Guard the coercion behind a union first: `z.coerce.number()` alone accepts
 * `[]`, because `Number([]) === 0`, so `stock: []` would quietly become 0.
 */
const numericLike = z.union([z.number(), z.string().trim().min(1)]);

/**
 * The coercion step of each pipe below.
 *
 * The input type is stated explicitly because a pipe is only well typed when
 * the target accepts exactly what the source produces, and `z.coerce.number()`
 * declares its input as `unknown`.
 */
const coerceNumber = () => z.coerce.number<string | number>();

export const nonNegativeInt = numericLike.pipe(
  coerceNumber().int('Must be a whole number').min(0, 'Must not be negative')
);

export const positiveInt = numericLike.pipe(
  coerceNumber().int('Must be a whole number').positive('Must be greater than zero')
);

/**
 * A whole number within a range. The primitives above are pipes, so they have
 * no chainable `.max()`; this builds the constraint up front instead.
 */
export const boundedInt = (min: number, max: number) =>
  numericLike.pipe(
    coerceNumber()
      .int('Must be a whole number')
      .min(min, `Must be at least ${min}`)
      .max(max, `Must be at most ${max}`)
  );

/** Free text that ends up in a document; bounded so a body cannot be unbounded. */
export const shortText = z.string().trim().max(200);
export const mediumText = z.string().trim().max(2000);

/** A 16-character order number as produced by the order controller. */
export const orderNumber = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{16}$/, 'Must be a valid order number');

export const objectIdParam = z.object({ id: objectId });
export const emailParam = z.object({ email });

export { z };
