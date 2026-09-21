import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A durable record of who did what.
 *
 * The request log already carries every call, but it rotates, it is not
 * queryable, and it is not the place to answer "who deleted this account".
 * This collection is: one row per privileged change, written where the change
 * happens.
 *
 * Append-only by convention - nothing in the application updates or deletes a
 * row - and deliberately denormalised. The actor's e-mail is copied in rather
 * than referenced, so the trail still reads correctly after the account it
 * describes has been deleted.
 */
const AuditLogSchema = new Schema({
  action: { type: String, required: true, index: true },

  actorId: { type: String },
  actorEmail: { type: String, required: true, index: true },
  actorRole: { type: String },

  /** What was acted on: a user, an order, a return request. */
  targetType: { type: String },
  targetId: { type: String, index: true },

  /** Anything worth knowing later, such as the status an order moved to. */
  details: { type: Schema.Types.Mixed },

  /** Ties a row back to the request log line for the same call. */
  requestId: { type: String },

  createdAt: { type: Date, default: Date.now, index: true },
});

export type AuditLogAttributes = InferSchemaType<typeof AuditLogSchema>;
export type AuditLogDocument = HydratedDocument<AuditLogAttributes>;

const AuditLog = defineModel<AuditLogAttributes>('AuditLog', AuditLogSchema);
export default AuditLog;
