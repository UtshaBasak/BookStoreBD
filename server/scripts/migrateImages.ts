/**
 * Moves existing base64 covers out of MongoDB and into Cloudinary.
 *
 * Safe to re-run: a listing whose images are already delivery URLs is skipped.
 * A document is only rewritten once every one of its uploads has succeeded, so
 * an interrupted run leaves the original base64 intact rather than a listing
 * with half its covers missing.
 *
 *   npm run migrate:images:dry              report what would change
 *   npm run migrate:images                  do it
 *   npm run migrate:images -- --limit 10    a cautious first batch
 *   MIGRATE_LIMIT=10 npm run migrate:images  the same, where `--` is eaten
 *
 * There is a `:dry` script rather than only the flag because PowerShell drops
 * the `--` separator when it calls a native command, so `-- --dry-run` never
 * reaches this script and the run silently becomes a real one. For the same
 * reason a live run announces itself and waits, instead of differing from a
 * dry run only by a line that is absent.
 */
import mongoose from 'mongoose';

import { assertRequiredEnv, mongoUri } from '../config/env.js';
import AddBook from '../models/AddBook.model.js';
import {
  isCloudinaryConfigured,
  isOwnedCloudinaryUrl,
  uploadImage,
} from '../config/cloudinary.js';
import { errorMessage } from '../utils/error.js';

const log = (...args: unknown[]): void => console.log('[migrate:images]', ...args);

const isInline = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

/**
 * `--limit 10`, or `MIGRATE_LIMIT=10` for the shells that eat the separator.
 */
export const parseLimit = (argv: string[]): number => {
  const index = argv.indexOf('--limit');
  const raw = index === -1 ? process.env.MIGRATE_LIMIT : argv[index + 1];
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
};

export const migrateImages = async ({ dryRun = false, limit = 0 } = {}) => {
  const candidates = await AddBook.find({ images: { $elemMatch: { $regex: '^data:' } } })
    .limit(limit || 0)
    .exec();

  log(`${candidates.length} listing(s) still hold inline images`);

  const summary = { migrated: 0, skipped: 0, failed: 0, uploaded: 0, bytesFreed: 0 };

  for (const book of candidates) {
    const original = book.images ?? [];
    const before = original.join('').length;

    if (!original.some(isInline)) {
      summary.skipped += 1;
      continue;
    }

    if (dryRun) {
      log(`  would migrate "${book.title}" (${original.filter(isInline).length} image(s))`);
      summary.migrated += 1;
      summary.bytesFreed += before;
      continue;
    }

    try {
      const images = [];
      const publicIds = [];

      for (const image of original) {
        if (isOwnedCloudinaryUrl(image) || !isInline(image)) {
          // Already hosted, or an external URL we do not own; leave it be.
          images.push(image);
          publicIds.push('');
          continue;
        }

        const result = await uploadImage(image);
        images.push(result.secure_url);
        publicIds.push(result.public_id);
        summary.uploaded += 1;
      }

      // Written only once every upload for this listing has succeeded.
      book.images = images;
      book.imagePublicIds = publicIds;
      await book.save();

      summary.migrated += 1;
      summary.bytesFreed += before - images.join('').length;
      log(`  migrated "${book.title}"`);
    } catch (error) {
      summary.failed += 1;
      log(`  FAILED "${book.title}": ${errorMessage(error)}`);
    }
  }

  return summary;
};

const main = async () => {
  assertRequiredEnv();

  if (!isCloudinaryConfigured()) {
    log('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must be set.');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const limit = parseLimit(process.argv);

  const uri = mongoUri();
  await mongoose.connect(uri);
  log(`connected to ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  if (dryRun) log('dry run: nothing will be written');
  if (limit) log(`limited to ${limit} listing(s)`);

  if (!dryRun) {
    const pending = await AddBook.countDocuments({ images: { $elemMatch: { $regex: '^data:' } } });
    if (pending > 0) {
      log(`LIVE RUN — ${pending} listing(s) will be rewritten. Ctrl+C within 5 seconds to stop.`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  const summary = await migrateImages({ dryRun, limit });

  log('');
  log(`migrated ${summary.migrated}, skipped ${summary.skipped}, failed ${summary.failed}`);
  log(`${summary.uploaded} image(s) uploaded`);
  log(`~${(summary.bytesFreed / 1048576).toFixed(2)} MB removed from MongoDB`);

  await mongoose.disconnect();
};

// Either extension: run through tsx in development, or from a build.
const invokedDirectly = /scripts\/migrateImages\.(ts|js)$/.test(
  process.argv[1]?.replace(/\\/g, '/') ?? ''
);
if (invokedDirectly) {
  main().catch(async (error: unknown) => {
    log('failed:', errorMessage(error));
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}
