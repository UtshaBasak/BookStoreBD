/**
 * Automatic moderation, measured: per-rule precision and recall on a labelled
 * set of reviews, listings and chat patterns, and the model layer's labels
 * checked offline against recorded answers.
 *
 * The thresholds are what the code measures today (see eval/RESULTS.md). They
 * are floors, not goals: a rule that gets worse fails here, and the false
 * positives the set records are known weaknesses, not things this test hides.
 * Nothing here calls Google.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createTestContext, closeTestContext } from './helpers/testApp.js';
import { MODERATION_CASES } from '../eval/moderationCases.js';
import { RECORDED_LABELS } from '../eval/moderationRecorded.js';
import { runModelLayer, runRuleLayer, type ModelLayerResult, type RuleLayerResult, type RuleStat } from '../eval/runModerationEval.js';

// Measured when the set was written (see eval/RESULTS.md); each is a weakness the set was built to expose.
const KNOWN_FALSE_POSITIVES: string[] = [];
const KNOWN_MISSES: string[] = [];

let rules: RuleLayerResult;
let model: ModelLayerResult;

const stat = (code: string): RuleStat => {
  const found = rules.perRule.find((rule) => rule.code === code);
  if (!found) throw new Error(`No rule ${code} in the results`);
  return found;
};

beforeAll(async () => {
  await createTestContext();
  rules = await runRuleLayer();
  model = await runModelLayer({ mode: 'offline' });
  if (process.env.EVAL_VERBOSE) console.log(`\n${rules.markdown}\n\n${model.markdown}\n`);
}, 120_000);
afterAll(closeTestContext);

describe('the moderation evaluation set', () => {
  it('has reviews, listings and chat patterns, in all four kinds of language, and tricky negatives', () => {
    expect(MODERATION_CASES.length).toBeGreaterThanOrEqual(60);
    for (const kind of ['review', 'listing', 'chat']) expect(MODERATION_CASES.filter((item) => item.kind === kind).length).toBeGreaterThanOrEqual(10);
    for (const language of ['en', 'bn', 'banglish']) expect(MODERATION_CASES.filter((item) => item.language === language).length).toBeGreaterThanOrEqual(5);
    expect(MODERATION_CASES.filter((item) => item.expect.length === 0).length).toBeGreaterThanOrEqual(20);
    const ids = MODERATION_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records a model answer for every public-text item, and none for chat', () => {
    for (const item of MODERATION_CASES) {
      if (item.kind === 'chat') expect(RECORDED_LABELS[item.id], item.id).toBeUndefined();
      else expect(RECORDED_LABELS[item.id], item.id).toBeDefined();
    }
  });
});

describe('the rule layer', () => {
  it('catches what it is built to catch: item-level recall', () => {
    expect(rules.overall.recall ?? 0).toBeGreaterThanOrEqual(0.85);
  });

  it('is mostly right when it flags: item-level precision', () => {
    expect(rules.overall.precision ?? 0).toBeGreaterThanOrEqual(0.75);
  });

  it('never misses a threat, abuse, a banned item or a contact detail it can read', () => {
    for (const code of ['threat', 'abuse', 'banned:pirated-copies', 'banned:exam-leaks', 'banned:fake-documents', 'banned:weapons', 'banned:alcohol-tobacco', 'banned:account-selling', 'banned:non-book-goods']) {
      expect(stat(code).recall, code).toBe(1);
    }
    expect(stat('contact-details').recall ?? 0).toBeGreaterThanOrEqual(0.8);
    expect(stat('off-site').recall).toBe(1);
    expect(stat('promotion').recall).toBe(1);
  });

  it('is precise on the rules whose words are unambiguous', () => {
    for (const code of ['threat', 'off-site', 'promotion', 'placeholder-price', 'price-outlier', 'discount-claim', 'missing-details', 'duplicate-photo', 'review-burst', 'new-account-extreme']) {
      expect(stat(code).precision, code).toBe(1);
    }
  });

  it('leaves honest complaints alone: "fraud", "চোর" and "chor" in a complaint raise nothing', () => {
    for (const id of ['rv-02', 'rv-03', 'rv-04', 'rv-05', 'rv-06', 'rv-35', 'rv-38', 'rv-39']) {
      expect(rules.predicted[id], id).toEqual([]);
    }
  });

  it('does not take an ISBN, a price, a year or Bangla digits for a phone number', () => {
    for (const id of ['rv-17', 'rv-18', 'ls-16', 'ls-17']) expect(rules.predicted[id], id).toEqual([]);
  });

  it('records its false positives as examples', () => {
    // Each is a documented weakness; a new one is a regression, and a fixed one should leave this list.
    expect(rules.falsePositives.map((example) => example.id).sort()).toEqual([...KNOWN_FALSE_POSITIVES].sort());
  });

  it('records its misses', () => {
    expect(rules.misses.map((example) => example.id).sort()).toEqual([...KNOWN_MISSES].sort());
  });
});

describe('the model layer, offline against recorded labels', () => {
  it('reads only public text', () => {
    const chat = MODERATION_CASES.filter((item) => item.kind === 'chat').length;
    expect(model.items).toBe(MODERATION_CASES.length - chat);
    for (const id of Object.keys(model.predicted)) expect(id.startsWith('ch-')).toBe(false);
  });

  it('turns a recorded label into the label the item gets, with the confidence cut applied', () => {
    expect(model.errors).toBe(0);
    // Recorded at 0.65, under the 0.7 cut: not flagged.
    expect(model.predicted['rv-34']).toBe('ok');
    // Recorded and above the cut.
    expect(model.predicted['rv-08']).toBe('abuse');
    expect(model.predicted['ls-02']).toBe('prohibited');
    // Too short to send at all.
    expect(model.predicted['rv-24']).toBe('ok');
  });

  it('keeps the recorded baseline: precision, recall and accuracy at what was recorded', () => {
    expect(model.flagged.precision ?? 0).toBeGreaterThanOrEqual(0.9);
    expect(model.flagged.recall ?? 0).toBeGreaterThanOrEqual(0.85);
    expect(model.accuracy).toBeGreaterThanOrEqual(0.9);
  });

  it('records its false positives and mislabels as examples', () => {
    expect(model.falsePositives.map((example) => example.id)).toEqual(['ls-31']);
    expect(model.mislabelled.map((example) => example.id)).toEqual(['rv-07']);
  });
});

