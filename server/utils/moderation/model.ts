import { z } from 'zod';

import { MODERATION_THRESHOLDS } from '../../config/moderationPolicy.js';
import {
  MODERATION_LABELS,
  MODERATION_RESPONSE_SCHEMA,
  moderationSystemPrompt,
  moderationUserPrompt,
} from '../../prompts/moderation.js';
import { stripContactDetails } from '../contactDetails.js';
import { generate, parseJsonAnswer } from '../gemini.js';
import type { Reason } from './rules.js';

/**
 * Moderation's model layer: one call that labels a piece of public text, for
 * the wording judgements rules cannot make - a targeted insult, a review about
 * something else, a listing for something that is not a book.
 *
 * The answer is checked against a fixed shape; anything else means no flag,
 * never a crash. A GeminiError (busy, over budget) is left to the caller,
 * which tries again later.
 */

const answerShape = z.object({
  label: z.enum(MODERATION_LABELS),
  confidence: z.coerce.number().min(0).max(1),
  reason: z.string().max(300).default(''),
});

const SCORE: Record<string, number> = {
  spam: 0.6,
  abuse: 0.75,
  personal_attack: 0.6,
  misleading: 0.5,
  prohibited: 0.7,
  off_topic: 0.3,
};

export const modelReasons = async (
  kind: 'review' | 'seller-review' | 'listing',
  text: string,
  context: string
): Promise<Reason[]> => {
  const content = stripContactDetails(text).slice(0, 2000);
  if (content.trim().length < 15) return [];
  const result = await generate({
    feature: 'moderation',
    purpose: `moderate:${kind}`,
    system: moderationSystemPrompt,
    contents: [{ role: 'user', parts: [{ text: moderationUserPrompt(kind, content, stripContactDetails(context).slice(0, 200)) }] }],
    responseSchema: MODERATION_RESPONSE_SCHEMA,
    readAbusiveText: true,
    temperature: 0,
    maxOutputTokens: 120,
  });
  const parsed = answerShape.safeParse(parseJsonAnswer(result.text));
  if (!parsed.success) return [];
  const { label, confidence, reason } = parsed.data;
  if (label === 'ok' || confidence < MODERATION_THRESHOLDS.modelConfidence) return [];
  return [
    {
      code: `model:${label}`,
      source: 'model',
      score: Math.round((SCORE[label] ?? 0.5) * confidence * 100) / 100,
      detail: `Model: ${label.replace('_', ' ')} (${Math.round(confidence * 100)}% sure). ${reason.replace(/[<>]/g, '').slice(0, 160)}`.trim(),
    },
  ];
};
