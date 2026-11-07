/**
 * Queues existing content for automatic moderation: the first scan after
 * turning moderation on, or a re-scan after the rules or word lists change.
 * Flags are idempotent, so running it twice changes nothing the second time.
 *
 *   npm run moderation:scan:dry  - counts what would be queued
 *   npm run moderation:scan      - queues it; the running server's worker checks it
 *   npm run moderation:scan -- --now   - also checks it here and now, until the queue is empty
 *
 * Needs MODERATION_MODE set to shadow or on.
 */
import mongoose from 'mongoose';

import { assertRequiredEnv, moderationMode, mongoUri } from '../config/env.js';
import AddBook from '../models/AddBook.model.js';
import ChatMessage from '../models/Chat.model.js';
import Review from '../models/Review.model.js';
import SellerReview from '../models/SellerReview.model.js';
import User from '../models/user.model.js';
import { enqueueModeration, runModerationOnce } from '../utils/moderation/queue.js';

const dryRun = process.argv.includes('--dry-run');
const now = process.argv.includes('--now');

const run = async (): Promise<void> => {
  assertRequiredEnv();
  if (moderationMode() === 'off') {
    console.log('MODERATION_MODE is off: set it to shadow (a trial) or on, then run this again.');
    return;
  }
  await mongoose.connect(mongoUri());

  const [reviews, sellerReviews, listings] = await Promise.all([
    Review.find({}, { _id: 1 }).lean(),
    SellerReview.find({}, { _id: 1 }).lean(),
    AddBook.find({}, { _id: 1 }).lean(),
  ]);
  // Chat: everyone who sent a message in the last day, since the rules look at a day.
  const senders = await ChatMessage.distinct('sender', { timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  const senderIds = (await User.find({ email: { $in: senders } }, { _id: 1 }).lean()).map((row) => row._id);

  console.log(`${dryRun ? 'Would queue' : 'Queuing'}: ${reviews.length} reviews, ${sellerReviews.length} seller ratings, ${listings.length} listings, ${senderIds.length} chat senders.`);
  if (!dryRun) {
    for (const row of reviews) await enqueueModeration('review', row._id);
    for (const row of sellerReviews) await enqueueModeration('seller-review', row._id);
    for (const row of listings) await enqueueModeration('listing', row._id);
    for (const id of senderIds) await enqueueModeration('chat', id);
    if (now) {
      let total = 0;
      for (let ran = await runModerationOnce(20); ran > 0; ran = await runModerationOnce(20)) total += ran;
      console.log(`Checked ${total} now. Anything waiting for the model is retried by the server's worker.`);
    }
  }
  await mongoose.disconnect();
};

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
