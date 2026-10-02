/**
 * Encrypts the fields kept encrypted at rest (utils/fieldCrypto.ts) on
 * records saved before DATA_ENCRYPTION_KEY was set. Safe to run more than
 * once: a value already encrypted is left alone.
 *
 *   npm run encrypt:existing
 */
import mongoose from 'mongoose';

import { assertRequiredEnv, mongoUri } from '../config/env.js';
import { encryptionEnabled, encryptValue, isEncrypted } from '../utils/fieldCrypto.js';

const TARGETS: readonly { collection: string; fields: readonly string[] }[] = [
  { collection: 'usertables', fields: ['address', 'phone', 'bkashMerchant'] },
  { collection: 'returnrequests', fields: ['refundBkash'] },
];

const run = async (): Promise<void> => {
  assertRequiredEnv();
  if (!encryptionEnabled()) {
    console.error('Set DATA_ENCRYPTION_KEY (32 bytes, base64) first: openssl rand -base64 32');
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(mongoUri());
  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  for (const { collection, fields } of TARGETS) {
    let changed = 0;
    // Straight to the collection, so nothing on the way decrypts what it reads.
    for await (const doc of db.collection(collection).find({}, { projection: Object.fromEntries(fields.map((f) => [f, 1])) })) {
      const $set: Record<string, unknown> = {};
      for (const field of fields) {
        const value = doc[field];
        if (typeof value === 'string' && value !== '' && !isEncrypted(value)) $set[field] = encryptValue(value);
      }
      if (Object.keys($set).length) {
        await db.collection(collection).updateOne({ _id: doc._id }, { $set });
        changed += 1;
      }
    }
    console.log(`${collection}: ${changed} encrypted`);
  }
  await mongoose.disconnect();
};

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
