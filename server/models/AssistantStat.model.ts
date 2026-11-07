import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * The shopping assistant's day in numbers, for the admin analytics: how many
 * questions, how many answered without the model, handed to a person, turned
 * away as off-topic, and how people rated the answers.
 *
 * Counts only. No question, answer or person is recorded here, and a day's
 * row removes itself after about a year.
 */
const AssistantStatSchema = new Schema({
  /** YYYY-MM-DD in Dhaka. */
  day: { type: String, required: true, unique: true },
  questions: { type: Number, default: 0 },
  fallbacks: { type: Number, default: 0 },
  handovers: { type: Number, default: 0 },
  outOfScope: { type: Number, default: 0 },
  helpful: { type: Number, default: 0 },
  unhelpful: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export type AssistantStatAttributes = InferSchemaType<typeof AssistantStatSchema>;

export default defineModel<AssistantStatAttributes>('AssistantStat', AssistantStatSchema);
