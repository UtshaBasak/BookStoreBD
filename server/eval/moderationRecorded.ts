/**
 * Recorded answers of the moderation model, one per public-text item in
 * moderationCases.ts: [label, confidence, reason], the three fields the real
 * model returns as JSON.
 *
 * Hand-written to represent a plausible Gemini Flash-Lite run, NOT captured
 * from one. Most items are labelled as the ground truth says, with the kinds
 * of slips such a model makes written in on purpose (a profane word it is only
 * 65% sure about, a firearms history flagged as prohibited, a vague evasion it
 * misses, a mild insult it calls abuse), so the metrics code is exercised on
 * misses, false positives and wrong labels as well as hits. They are a
 * regression baseline for the plumbing - the schema check, the confidence
 * threshold, how a label becomes a reason - not a measure of the live model.
 * Live numbers come from `npm run eval:moderation:live`.
 */
import type { ModerationLabel } from '../prompts/moderation.js';

export const RECORDED_LABELS: Record<string, [label: ModerationLabel, confidence: number, reason: string]> = {
  'rv-01': ['ok', 0.9, 'ordinary content'],
  'rv-02': ['ok', 0.85, 'honest complaint'],
  'rv-03': ['ok', 0.8, 'complaint about a torn book'],
  'rv-04': ['ok', 0.8, 'complaint about a torn book'],
  'rv-05': ['ok', 0.9, 'ordinary content'],
  'rv-06': ['ok', 0.9, 'ordinary content'],
  'rv-07': ['abuse', 0.8, 'abusive words aimed at the seller'],
  'rv-08': ['abuse', 0.9, 'abusive language'],
  'rv-09': ['abuse', 0.9, 'abusive language'],
  'rv-10': ['abuse', 0.9, 'abusive language'],
  'rv-11': ['abuse', 0.9, 'abusive language'],
  'rv-12': ['spam', 0.9, 'advertising or contact farming'],
  'rv-13': ['spam', 0.9, 'advertising or contact farming'],
  'rv-14': ['spam', 0.9, 'advertising or contact farming'],
  'rv-15': ['spam', 0.9, 'advertising or contact farming'],
  'rv-16': ['spam', 0.9, 'advertising or contact farming'],
  'rv-17': ['ok', 0.9, 'ordinary content'],
  'rv-18': ['ok', 0.9, 'ordinary content'],
  'rv-19': ['ok', 0.9, 'ordinary content'],
  'rv-20': ['off_topic', 0.75, 'not about a book'],
  'rv-21': ['off_topic', 0.75, 'about a different product'],
  'rv-22': ['spam', 0.9, 'advertising or contact farming'],
  'rv-23': ['ok', 0.9, 'ordinary content'],
  'rv-24': ['ok', 0.9, 'ordinary content'],
  'rv-25': ['ok', 0.9, 'ordinary content'],
  'rv-26': ['ok', 0.9, 'ordinary content'],
  'rv-27': ['ok', 0.8, 'harsh about packaging only'],
  'rv-28': ['personal_attack', 0.85, 'insults the seller'],
  'rv-29': ['abuse', 0.9, 'abusive language'],
  'rv-30': ['spam', 0.9, 'advertising or contact farming'],
  'rv-31': ['spam', 0.9, 'advertising or contact farming'],
  'rv-32': ['spam', 0.9, 'advertising or contact farming'],
  'rv-33': ['ok', 0.6, 'unclear, reads like praise'],
  'rv-34': ['abuse', 0.65, 'one profane word in a complaint'],
  'rv-35': ['ok', 0.9, 'ordinary content'],
  'rv-36': ['ok', 0.85, 'a phrase in a book review'],
  'rv-37': ['ok', 0.9, 'ordinary content'],
  'rv-38': ['ok', 0.9, 'ordinary content'],
  'rv-39': ['ok', 0.9, 'ordinary content'],
  'rv-40': ['ok', 0.9, 'ordinary content'],
  'ls-01': ['ok', 0.9, 'ordinary content'],
  'ls-02': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-03': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-04': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-05': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-06': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-07': ['spam', 0.9, 'advertising or contact farming'],
  'ls-08': ['spam', 0.9, 'advertising or contact farming'],
  'ls-09': ['ok', 0.9, 'ordinary content'],
  'ls-10': ['ok', 0.9, 'ordinary content'],
  'ls-11': ['ok', 0.9, 'ordinary content'],
  'ls-12': ['ok', 0.9, 'ordinary content'],
  'ls-13': ['ok', 0.9, 'ordinary content'],
  'ls-14': ['ok', 0.9, 'ordinary content'],
  'ls-15': ['ok', 0.9, 'ordinary content'],
  'ls-16': ['ok', 0.9, 'ordinary content'],
  'ls-17': ['ok', 0.9, 'ordinary content'],
  'ls-18': ['ok', 0.9, 'ordinary content'],
  'ls-19': ['prohibited', 0.85, 'sells a social media account'],
  'ls-20': ['abuse', 0.8, 'insults readers'],
  'ls-21': ['ok', 0.9, 'ordinary content'],
  'ls-22': ['ok', 0.9, 'ordinary content'],
  'ls-23': ['spam', 0.9, 'advertising or contact farming'],
  'ls-24': ['ok', 0.9, 'ordinary content'],
  'ls-25': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-26': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-27': ['ok', 0.9, 'ordinary content'],
  'ls-28': ['ok', 0.9, 'ordinary content'],
  'ls-29': ['prohibited', 0.9, 'not allowed on the site'],
  'ls-30': ['ok', 0.8, 'a pharmacology textbook'],
  'ls-31': ['prohibited', 0.75, 'mentions firearms and explosives'],
  'ls-32': ['misleading', 0.72, 'says new but is a reprint'],
};
