import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * Something that happened which one person should hear about: an order they
 * placed or received, a status change, a cancellation, a return decided, a
 * payout, a review, a deal on a book they saved.
 *
 * Addressed by e-mail, as orders and chats are. Written where the thing
 * happens (utils/notify.ts), and pushed to the person's open pages over the
 * socket as well as stored, so the bell is right whether or not they were
 * looking at the time.
 */
const NotificationSchema = new Schema({
  recipient: { type: String, required: true },
  /** What kind of thing happened; the page picks an icon by it. */
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  /** Where tapping it goes: a path inside the site. */
  link: { type: String, default: '' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// A person's newest first, and how many they have not read.
NotificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
NotificationSchema.index({ recipient: 1, read: 1 });
// Kept for ninety days: a bell is for what is recent, not an archive.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export type NotificationAttributes = InferSchemaType<typeof NotificationSchema>;
export type NotificationDocument = HydratedDocument<NotificationAttributes>;

const Notification = defineModel<NotificationAttributes>('Notification', NotificationSchema);
export default Notification;
