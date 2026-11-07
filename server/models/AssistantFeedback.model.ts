import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A thumbs up or down on one of the assistant's answers, tied to the request
 * id in the log - never to the question or the answer, which are not stored.
 * One per answer; kept for six months.
 */
const AssistantFeedbackSchema = new Schema({
  requestId: { type: String, required: true, unique: true },
  helpful: { type: Boolean, required: true },
  reason: { type: String, enum: ['wrong', 'unhelpful', 'off-topic', 'slow', 'other', null], default: null },
  signedIn: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
});

export type AssistantFeedbackAttributes = InferSchemaType<typeof AssistantFeedbackSchema>;

export default defineModel<AssistantFeedbackAttributes>('AssistantFeedback', AssistantFeedbackSchema);
