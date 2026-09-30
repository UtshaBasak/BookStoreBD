/**
 * Which side of the profile somebody was on: buying or selling.
 *
 * Read from the address first (`/profile?mode=seller`), which is what the
 * seller's pages link back to; then from the last choice on this device; and
 * buyer otherwise. Storage can be unavailable - a private window - and then
 * only the address counts.
 */
export type ProfileMode = 'buyer' | 'seller';

const KEY = 'profileMode';

const isMode = (value: unknown): value is ProfileMode => value === 'buyer' || value === 'seller';

export const readProfileMode = (fromUrl: string | null): ProfileMode => {
  if (isMode(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(KEY);
    if (isMode(stored)) return stored;
  } catch {
    // Unavailable storage: fall through to the default.
  }
  return 'buyer';
};

export const rememberProfileMode = (mode: ProfileMode): void => {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Not remembered; the address still carries it.
  }
};
