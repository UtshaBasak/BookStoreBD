/**
 * Embeds every listing for the assistant's search by meaning: the first time
 * the Gemini key is set, or after changing GEMINI_EMBEDDING_MODEL. Listings
 * whose text has not changed are skipped, so it is safe to run again.
 *
 *   npm run assistant:embed            - queues them; the running server's worker embeds them
 *   npm run assistant:embed -- --now   - embeds them here, paced to stay inside the free tier
 */
import mongoose from 'mongoose';

import { assertRequiredEnv, geminiSettings, mongoUri } from '../config/env.js';
import AddBook from '../models/AddBook.model.js';
import { embedListing } from '../utils/assistant/semantic.js';
import { enqueueModeration } from '../utils/moderation/queue.js';
import { GeminiError, geminiEnabled } from '../utils/gemini.js';

const now = process.argv.includes('--now');
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const run = async (): Promise<void> => {
  assertRequiredEnv();
  if (!geminiEnabled()) {
    console.log('GEMINI_API_KEY is not set: there is nothing to embed with.');
    return;
  }
  await mongoose.connect(mongoUri());
  const listings = await AddBook.find({}, { _id: 1 }).lean();
  if (!now) {
    for (const row of listings) await enqueueModeration('embed', row._id);
    console.log(`Queued ${listings.length} listings; the server's worker embeds them in the background.`);
  } else {
    // Moderation's share of the per-minute budget, with room to spare.
    const pace = Math.ceil(60_000 / Math.max(1, Math.floor(geminiSettings().requestsPerMinute * geminiSettings().moderationShare)));
    let done = 0;
    for (const row of listings) {
      try {
        if (await embedListing(row._id)) done += 1;
      } catch (error) {
        if (error instanceof GeminiError && error.kind === 'budget') {
          console.log('Daily budget used; run again tomorrow to finish.');
          break;
        }
        console.log(`Skipped one: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(pace);
    }
    console.log(`Embedded ${done} of ${listings.length} listings.`);
  }
  await mongoose.disconnect();
};

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
