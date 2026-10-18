/**
 * Repairs data saved before the October 2026 fixes (utils/dataCleanUp.ts has
 * what and why). Look first, then repair:
 *
 *   npm run cleanup:data:dry   - says what it would change, changes nothing
 *   npm run cleanup:data       - changes it
 *
 * Safe to run more than once.
 */
import mongoose from 'mongoose';

import { assertRequiredEnv, mongoUri } from '../config/env.js';
import { cleanUpData } from '../utils/dataCleanUp.js';

const dryRun = process.argv.includes('--dry-run');

const run = async (): Promise<void> => {
  assertRequiredEnv();
  await mongoose.connect(mongoUri());
  const report = await cleanUpData({ dryRun });
  console.log(dryRun ? 'Would change (nothing has been changed):' : 'Changed:');
  console.log(`  order lines no longer counted as returned: ${report.returnFlagsCleared}`);
  console.log(`  "N/A" listing fields cleared:              ${report.listingFieldsCleared}`);
  console.log(`  conditions taken off new books:             ${report.newBookConditionsCleared}`);
  console.log(`  conditions taken off new-book order lines:  ${report.orderConditionsCleared}`);
  console.log(`  reviews with only cancelled orders removed: ${report.reviewsRemoved}`);
  console.log(`  seller ratings with only cancelled orders:  ${report.sellerRatingsRemoved}`);
  await mongoose.disconnect();
};

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
