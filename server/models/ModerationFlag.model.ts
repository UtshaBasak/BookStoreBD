import { Schema, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * Something automatic moderation thinks an administrator should look at: a
 * review, a seller rating, a listing, or a run of chat messages from one
 * sender.
 *
 * A flag never hides or removes anything - the content stays exactly as it
 * was until an administrator decides. It records which rules or model labels
 * fired and why, how sure it is, and what was decided.
 *
 * One flag per piece of content: scanning it again updates the same flag, and
 * `fingerprint` (a hash of the text that was scanned) says whether anything
 * changed since. A flag made in shadow mode is kept out of the admin queue,
 * for a trial run.
 */
export const FLAG_TARGETS = ['review', 'seller-review', 'listing', 'chat'] as const;
export type FlagTarget = (typeof FLAG_TARGETS)[number];

export const FLAG_STATUSES = ['open', 'cleared', 'actioned'] as const;

const ReasonSchema = new Schema(
  {
    /** The rule or label, e.g. `contact-details`, `abuse`, `price-outlier`, `model:spam`. */
    code: { type: String, required: true },
    source: { type: String, enum: ['rule', 'model'], required: true },
    /** 0-1: how strongly this points at a problem. */
    score: { type: Number, required: true },
    /** Why, in plain words, for the administrator. */
    detail: { type: String, default: '' },
  },
  { _id: false }
);

const ModerationFlagSchema = new Schema(
  {
    targetType: { type: String, enum: FLAG_TARGETS, required: true },
    /** The review, listing - or, for chat, the sender's account. */
    targetId: { type: Schema.Types.ObjectId, required: true },
    /** Who wrote it, so an administrator can message them. Seen by administrators only. */
    authorEmail: { type: String, default: '' },
    /** What it is about, for the list: a book's title, a seller's name. */
    label: { type: String, default: '' },
    /** The start of public text (a review, a listing), for the list. Never chat text. */
    excerpt: { type: String, default: '' },
    /** Chat only: the messages that fired a rule, and how many there were. */
    messageIds: { type: [Schema.Types.ObjectId], default: [] },
    messageCount: { type: Number, default: 0 },
    fingerprint: { type: String, default: '' },
    reasons: { type: [ReasonSchema], default: [] },
    /** The highest reason score. */
    score: { type: Number, default: 0 },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    status: { type: String, enum: FLAG_STATUSES, default: 'open' },
    shadow: { type: Boolean, default: false },
    decision: { type: String, enum: ['cleared', 'removed', 'messaged', null], default: null },
    decidedBy: { type: String, default: '' },
    decidedAt: { type: Date, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// One flag per piece of content: a re-scan updates it.
ModerationFlagSchema.index({ targetType: 1, targetId: 1 }, { unique: true });
// The admin queue: open flags, newest or highest first, by type.
ModerationFlagSchema.index({ status: 1, shadow: 1, updatedAt: -1, _id: -1 });
ModerationFlagSchema.index({ status: 1, shadow: 1, score: -1, _id: -1 });
ModerationFlagSchema.index({ targetType: 1, status: 1, updatedAt: -1 });
// Precision per rule.
ModerationFlagSchema.index({ 'reasons.code': 1, status: 1 });

export type ModerationFlagAttributes = InferSchemaType<typeof ModerationFlagSchema>;
export type LeanModerationFlag = ModerationFlagAttributes & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export default defineModel<ModerationFlagAttributes>('ModerationFlag', ModerationFlagSchema);
