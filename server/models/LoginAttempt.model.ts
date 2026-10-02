import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * Wrong passwords for one address, so repeated guessing locks it for a while.
 * Filed under an HMAC of the address, like one-time codes, and gone an hour
 * after the last attempt.
 */
const LoginAttemptSchema = new Schema({
  key: { type: String, required: true, unique: true },
  failures: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export type LoginAttemptAttributes = InferSchemaType<typeof LoginAttemptSchema>;

export default defineModel<LoginAttemptAttributes>('LoginAttempt', LoginAttemptSchema);
