import type { OwnProfile, ProfileResponse } from '@shared/api.js';

/**
 * True when a profile response carries the owner-only fields.
 *
 * `GET /user/profile` answers with the public shape - handle, e-mail and avatar
 * - to anyone looking at a seller's listing, and the full record only to the
 * owner or an administrator. `role` is present on exactly the second of those,
 * which is what makes it a usable discriminator.
 */
export const isOwnProfile = (
  profile: ProfileResponse | null | undefined
): profile is OwnProfile => Boolean(profile && 'role' in profile);
