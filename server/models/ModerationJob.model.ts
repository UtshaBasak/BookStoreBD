import { Schema, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * Content waiting to be checked. Writing a review, a listing or a chat message
 * only adds one of these - cheap, and never in the way of the write - and the
 * worker in utils/moderation/queue.ts picks them up.
 *
 * Kept in the database because the free host sleeps and restarts: a job
 * survives that and is picked up again. Content waits once: a second write
 * before the check runs finds the job already pending. Finished jobs remove
 * themselves after a week.
 */
/** `embed` is the assistant's: a listing's text turned into a vector for search by meaning. */
export const JOB_KINDS = ['review', 'seller-review', 'listing', 'chat', 'embed'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

const ModerationJobSchema = new Schema({
  kind: { type: String, enum: JOB_KINDS, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  runAfter: { type: Date, default: Date.now },
  /** When a worker took it, so one that died mid-job can be taken again. */
  startedAt: { type: Date, default: null },
  /** A short code, never content. */
  lastError: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  finishedAt: { type: Date, default: null },
});

// At most one pending job per piece of content.
ModerationJobSchema.index(
  { kind: 1, targetId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
// What the worker asks for: the oldest due job.
ModerationJobSchema.index({ status: 1, runAfter: 1 });
ModerationJobSchema.index({ finishedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export type ModerationJobAttributes = InferSchemaType<typeof ModerationJobSchema>;
export type LeanModerationJob = ModerationJobAttributes & { _id: Types.ObjectId };

export default defineModel<ModerationJobAttributes>('ModerationJob', ModerationJobSchema);
