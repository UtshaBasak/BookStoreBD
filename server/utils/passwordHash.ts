import bcryptjs from 'bcryptjs';

/**
 * How passwords are hashed: bcrypt, at a cost of 12 - four times the work of
 * the old 10 for anyone trying guesses against a stolen hash, and still about a
 * quarter of a second for a real sign-in.
 *
 * BCRYPT_ROUNDS can set it from 10 to 14; the test suite uses 10, for speed.
 * Hashes made at a lower cost keep working and are upgraded the next time
 * their owner signs in (see `upgradeHashIfNeeded`).
 */
export const bcryptRounds = (): number => {
  const wanted = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(wanted) && wanted >= 10 && wanted <= 14 ? wanted : 12;
};

export const hashPassword = (plain: string): string => bcryptjs.hashSync(plain, bcryptRounds());

/** Whether a stored hash was made at less than today's cost. */
export const needsRehash = (hash: string | null | undefined): boolean => {
  if (!hash) return false;
  try {
    return bcryptjs.getRounds(hash) < bcryptRounds();
  } catch {
    return false;
  }
};

/**
 * After a right password, re-hashes it at today's cost if it was made at a
 * lower one. Only possible then: a hash cannot be strengthened without the
 * password. Saves straight to the record, so nothing else about it changes.
 */
export const upgradeHashIfNeeded = async (
  user: { _id: unknown; password?: string | null },
  plain: string,
  save: (hash: string) => Promise<unknown>
): Promise<void> => {
  if (!needsRehash(user.password)) return;
  const hash = hashPassword(plain);
  await save(hash);
  user.password = hash;
};
