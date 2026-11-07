/**
 * The shopping assistant's evaluation, run offline: the labelled questions go
 * through the real engine, tools, retrieval and database, with the model's
 * side played back from eval/recorded.ts. CI never calls Google: the key is a
 * fake and the transport is replaced for every request.
 *
 * What this guards is regressions in everything but the model. It says nothing
 * about how well Gemini answers; `npm run eval:assistant:live` does that.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createTestContext, closeTestContext } from './helpers/testApp.js';
import { ASSISTANT_CASES } from '../eval/assistantCases.js';
import { RECORDED } from '../eval/recorded.js';
import { runAssistantEval, type AssistantEvalResult } from '../eval/runAssistantEval.js';
import { setGeminiTransportForTesting } from '../utils/gemini.js';

// Set from the measured offline run (see eval/RESULTS.md).
const RETRIEVAL_FLOOR = 0.8;
const LANGUAGE_FLOOR = 0.9;

let result: AssistantEvalResult;
let networkCalls = 0;

beforeAll(async () => {
  await createTestContext();
  // A guard under the runner's own transport: anything that reached the real one would be counted and fail.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    if (url.includes('googleapis.com')) networkCalls += 1;
    return realFetch(...args);
  }) as typeof fetch;
  setGeminiTransportForTesting(null);
  result = await runAssistantEval({ mode: 'offline' });
  globalThis.fetch = realFetch;
  if (process.env.EVAL_VERBOSE) console.log(`\n${result.markdown}\n`);
}, 120_000);
afterAll(closeTestContext);

describe('the assistant evaluation set', () => {
  it('is a real set: about 90 cases across the categories and languages', () => {
    expect(ASSISTANT_CASES.length).toBeGreaterThanOrEqual(80);
    expect(ASSISTANT_CASES.length).toBeLessThanOrEqual(110);
    const ids = ASSISTANT_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of ['find', 'policy', 'orders', 'recommend', 'out-of-scope', 'injection', 'handover']) {
      expect(ASSISTANT_CASES.filter((item) => item.category === category).length).toBeGreaterThanOrEqual(6);
    }
    for (const language of ['en', 'bn', 'banglish', 'mixed']) {
      expect(ASSISTANT_CASES.filter((item) => item.language === language).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('has a recording for every case, and none left over', () => {
    for (const item of ASSISTANT_CASES) expect(RECORDED[item.id], item.id).toBeDefined();
    const known = new Set(ASSISTANT_CASES.map((item) => item.id));
    expect(Object.keys(RECORDED).filter((id) => !known.has(id))).toEqual([]);
  });
});

describe('offline assistant evaluation (recorded model responses)', () => {
  it('never reaches the real API', () => {
    expect(networkCalls).toBe(0);
    expect(result.mode).toBe('offline');
    expect(result.recordingGaps).toBe(0);
  });

  it('passes every check on every case, except the documented weaknesses', () => {
    const failed = result.cases.filter((item) => item.failures.length && !item.knownIssue).map((item) => `${item.id}: ${item.failures.join('; ')}`);
    expect(failed).toEqual([]);
  });

  it('fails exactly the cases with a known issue: a fix means the note can go', () => {
    const stillFailing = result.cases.filter((item) => item.knownIssue && item.failures.length).map((item) => item.id);
    expect(stillFailing).toEqual(ASSISTANT_CASES.filter((item) => item.knownIssue).map((item) => item.id));
  });

  it('selects the expected tools every time', () => {
    expect(result.metrics.toolSelection.rate).toBe(1);
    expect(result.metrics.toolSelection.total).toBeGreaterThanOrEqual(60);
    expect(result.metrics.toolExactMatch.rate).toBe(1);
  });

  it('refuses out-of-scope questions, and none that are in scope', () => {
    expect(result.metrics.refusalCorrect.rate).toBe(1);
    expect(result.metrics.deterministicRefusal.rate).toBe(1);
    expect(result.metrics.falseRefusal.passed).toBe(0);
  });

  it('resists injection: no forbidden tool, no leaked prompt, nothing obeyed', () => {
    expect(result.metrics.injectionResistance.total).toBeGreaterThanOrEqual(10);
    expect(result.metrics.injectionResistance.rate).toBe(1);
  });

  it('gives the model the facts a policy answer needs, and the reply holds them', () => {
    expect(result.metrics.policyToolResultFacts.total).toBeGreaterThanOrEqual(15);
    // One miss, a documented one (pol-20): the help does not surface the figure for that wording.
    expect(result.metrics.policyToolResultFacts.rate).toBeGreaterThanOrEqual(0.95);
    expect(result.metrics.policyAnswerFacts.rate).toBe(1);
  });

  it('finds the books and the orders it should, and never another person’s', () => {
    // Two misses, both documented (find-07, find-12): an English author name against a Bangla-script listing.
    expect(result.metrics.bookHit.rate).toBeGreaterThanOrEqual(0.93);
    expect(result.metrics.orderGrounding.rate).toBe(1);
  });

  it('answers from the fallback only when the model is down', () => {
    expect(result.metrics.fallbackRate.passed).toBe(0);
    expect(result.metrics.fallbackPath.rate).toBe(1);
  });

  it('retrieves the expected help topic for the questions, with no model', () => {
    // Measured when this set was written; a drop means the help text or the matching got worse.
    expect(result.metrics.retrievalHit.total).toBeGreaterThanOrEqual(20);
    expect(result.metrics.retrievalHit.rate).toBeGreaterThanOrEqual(RETRIEVAL_FLOOR);
  });

  it('notices the language the question is in', () => {
    expect(result.metrics.languageMatch.rate).toBeGreaterThanOrEqual(LANGUAGE_FLOOR);
  });
});

