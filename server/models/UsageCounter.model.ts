import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A count that empties itself: the Gemini API's daily budget, and how many
 * questions one person or one address has asked the assistant today.
 *
 * Kept in the database rather than in memory because the free host sleeps and
 * restarts, and a budget that reset with every restart would not be one. The
 * key names a bucket and a day (`gemini:2026-11-08`, `assistant:user:<hash>:...`),
 * never an address in plain text.
 */
const UsageCounterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export type UsageCounterAttributes = InferSchemaType<typeof UsageCounterSchema>;

export default defineModel<UsageCounterAttributes>('UsageCounter', UsageCounterSchema);
