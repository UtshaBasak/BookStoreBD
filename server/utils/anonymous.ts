import { randomUUID } from 'crypto';

/**
 * Reserved by RFC 2606 for exactly this: an address that is guaranteed never to
 * belong to anybody, and is obviously not a real one to whoever reads it.
 */
export const ANONYMOUS_DOMAIN = 'removed.invalid';

/** What is shown in place of somebody who has closed their account. */
export const DELETED_USER_NAME = 'Deleted user';

/**
 * A stand-in for a deleted account.
 *
 * Unique per deletion rather than a single shared value, so the rows that
 * belonged to one person can still be told apart from another's - the records
 * stay coherent without anyone being identifiable.
 */
export const anonymousEmail = (): string => `deleted-${randomUUID().slice(0, 8)}@${ANONYMOUS_DOMAIN}`;

/** True for an address that stands in for a closed account. */
export const isAnonymous = (email: string | null | undefined): boolean =>
  typeof email === 'string' && email.endsWith(`@${ANONYMOUS_DOMAIN}`);

/** A name to show for an address, never the raw tombstone. */
export const displayNameFor = (email: string, username?: string | null): string => {
  if (username) return username;
  return isAnonymous(email) ? DELETED_USER_NAME : email;
};
