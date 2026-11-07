import UsageCounter from '../models/UsageCounter.model.js';
import { isDuplicateKeyError } from './error.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today in Dhaka, as YYYY-MM-DD: a day's budget starts at midnight where the shop is. */
export const dhakaDay = (now: number = Date.now()): string =>
  new Date(now + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** How much of a bucket has been used. */
export const usageOf = async (key: string): Promise<number> =>
  (await UsageCounter.findOne({ key }, { count: 1 }).lean())?.count ?? 0;

/**
 * Adds to a bucket and answers its new total. The bucket is created on first
 * use and removes itself a little after the day it counts.
 */
export const addUsage = async (key: string, by = 1): Promise<number> => {
  const update = { $inc: { count: by }, $setOnInsert: { expiresAt: new Date(Date.now() + 2 * DAY_MS) } };
  try {
    const row = await UsageCounter.findOneAndUpdate({ key }, update, { upsert: true, returnDocument: 'after' }).lean();
    return row?.count ?? by;
  } catch (error) {
    // Two first uses at once: one insert wins, the other retries as an update.
    if (!isDuplicateKeyError(error)) throw error;
    const row = await UsageCounter.findOneAndUpdate({ key }, update, { returnDocument: 'after' }).lean();
    return row?.count ?? by;
  }
};
