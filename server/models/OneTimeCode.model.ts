import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A one-time code, while it is live.
 *
 * These used to sit in a `Map` in the process. That works until the process
 * restarts - which it does on every deploy, and which a sleeping instance does
 * on its own - and every code in flight went with it: somebody halfway through
 * signing up or resetting a password got "invalid code" and had to start
 * again. It also meant a second instance could not see codes issued by the
 * first.
 */
const OneTimeCodeSchema = new Schema({
  /*
   * The address, as a digest.
   *
   * One live code per address - issuing a second replaces the first, so an old
   * code cannot be used once a new one has been asked for - but the address
   * itself is not stored: a collection of "who asked for a code, and when" is
   * not something worth keeping, and it means no value from a request ever
   * reaches the query.
   */
  key: { type: String, required: true, unique: true },
  /** An HMAC of the code, never the code. See utils/otpStore.ts. */
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  /** Set once the code has been checked, which is what signup then requires. */
  verified: { type: Boolean, default: false },
  /** Wrong guesses against this code, across every address they came from. */
  attempts: { type: Number, default: 0 },
});

/*
 * MongoDB removes the document once `expiresAt` passes, which is what the
 * old `pruneExpiredOtps()` sweep was for.
 *
 * Its sweeper runs about once a minute, so a document can outlive its expiry
 * by that much. The code checks the date itself rather than trusting the
 * index to be prompt.
 */
OneTimeCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OneTimeCodeAttributes = InferSchemaType<typeof OneTimeCodeSchema>;
export type OneTimeCodeDocument = HydratedDocument<OneTimeCodeAttributes>;

export default defineModel<OneTimeCodeAttributes>('OneTimeCode', OneTimeCodeSchema);
