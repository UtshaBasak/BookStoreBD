import type { Types } from 'mongoose';

import ModerationFlag, { type FlagTarget } from '../../models/ModerationFlag.model.js';
import { disabledModerationRules, moderationMode } from '../../config/env.js';
import { isDuplicateKeyError } from '../error.js';
import type { Reason } from './rules.js';

/**
 * Turning reasons into a flag, idempotently.
 *
 * Scanning the same content again changes nothing. New evidence about the same
 * content (a model label arriving after the rules) is added to the open flag.
 * A flag an administrator has decided stays decided unless the content itself
 * changes - then it is opened again, because what they judged is gone.
 */

export interface FlagInput {
  targetType: FlagTarget;
  targetId: Types.ObjectId;
  authorEmail: string;
  label: string;
  excerpt: string;
  fingerprint: string;
  reasons: Reason[];
  messageIds?: Types.ObjectId[];
  messageCount?: number;
}

const severityOf = (score: number): 'low' | 'medium' | 'high' => (score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low');

/** Best reason per code: a rule and the model can both speak, each once. */
const mergeReasons = (existing: Reason[], incoming: Reason[]): Reason[] => {
  const byCode = new Map<string, Reason>();
  for (const item of [...existing, ...incoming]) {
    const known = byCode.get(item.code);
    if (!known || item.score > known.score) byCode.set(item.code, item);
  }
  return [...byCode.values()].sort((a, b) => b.score - a.score);
};

export type SaveOutcome = 'created' | 'updated' | 'unchanged' | 'reopened' | 'none';

export const saveFlag = async (input: FlagInput): Promise<SaveOutcome> => {
  const off = disabledModerationRules();
  const reasons = input.reasons.filter((item) => !off.has(item.code) && !off.has(item.code.split(':')[0] ?? ''));
  if (!reasons.length) return 'none';

  const existing = await ModerationFlag.findOne({ targetType: input.targetType, targetId: input.targetId }).lean();
  const details = {
    authorEmail: input.authorEmail,
    label: input.label.slice(0, 200),
    excerpt: input.excerpt.slice(0, 280),
    messageIds: input.messageIds ?? [],
    messageCount: input.messageCount ?? 0,
  };

  if (!existing) {
    const score = Math.max(...reasons.map((item) => item.score));
    try {
      await ModerationFlag.create({
        targetType: input.targetType,
        targetId: input.targetId,
        ...details,
        fingerprint: input.fingerprint,
        reasons: mergeReasons([], reasons),
        score,
        severity: severityOf(score),
        shadow: moderationMode() !== 'on',
      });
      return 'created';
    } catch (error) {
      // Two scans at once: the other one made it, and this one adds to it below.
      if (!isDuplicateKeyError(error)) throw error;
      return saveFlag(input);
    }
  }

  const changed = existing.fingerprint !== input.fingerprint;
  if (!changed && existing.status !== 'open') return 'unchanged';

  const merged = changed ? mergeReasons([], reasons) : mergeReasons(existing.reasons as Reason[], reasons);
  const sameReasons =
    !changed &&
    merged.length === existing.reasons.length &&
    merged.every((item) => existing.reasons.some((known) => known.code === item.code && known.score === item.score));
  if (sameReasons) return 'unchanged';

  const score = Math.max(...merged.map((item) => item.score));
  await ModerationFlag.updateOne(
    { _id: existing._id },
    {
      $set: {
        ...details,
        fingerprint: input.fingerprint,
        reasons: merged,
        score,
        severity: severityOf(score),
        ...(changed && existing.status !== 'open'
          ? { status: 'open', decision: null, decidedBy: '', decidedAt: null, shadow: moderationMode() !== 'on' }
          : {}),
      },
    }
  );
  return changed && existing.status !== 'open' ? 'reopened' : 'updated';
};
