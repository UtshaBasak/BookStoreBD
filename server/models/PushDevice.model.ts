import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A phone that has asked for push notifications: its Firebase Cloud Messaging
 * token, and the Android session it belongs to.
 *
 * Tied to the session (the refresh-token family), not only to the account, so
 * signing out on the phone - or "sign out everywhere else" from another one -
 * stops its notifications too (utils/refreshToken.ts removes the row). What is
 * pushed carries only an id; the phone fetches the rest over the API
 * (utils/push.ts), so no personal text passes through Google.
 */
const PushDeviceSchema = new Schema(
  {
    /** The FCM registration token. One phone, one row. */
    token: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'UserTable', required: true, index: true },
    /** The session's refresh-token family: one push token per signed-in phone. */
    family: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// A phone that has not been heard from in two months has most likely gone:
// FCM drops tokens after 270 days, and the app registers again on every start.
PushDeviceSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export type PushDeviceAttributes = InferSchemaType<typeof PushDeviceSchema>;
export type PushDeviceDocument = HydratedDocument<PushDeviceAttributes>;

export default defineModel<PushDeviceAttributes>('PushDevice', PushDeviceSchema);
