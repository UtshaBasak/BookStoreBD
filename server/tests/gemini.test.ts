/**
 * The Gemini client: off without a key, the key never in an address, the
 * shop-wide budget and moderation's share of it, retries, and failures that
 * come back as a kind the caller can fall back on. Google is never called:
 * the transport is replaced.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import {
  GeminiError,
  embed,
  generate,
  geminiEnabled,
  parseJsonAnswer,
  resetGeminiBudgetForTesting,
  setGeminiTransportForTesting,
  type GeminiTransport,
} from '../utils/gemini.js';
import { findContactDetails, stripContactDetails, toAsciiDigits } from '../utils/contactDetails.js';

beforeAll(async () => {
  await createTestContext();
});
afterAll(closeTestContext);
beforeEach(async () => {
  await clearDatabase();
  resetGeminiBudgetForTesting();
});
afterEach(() => {
  setGeminiTransportForTesting(null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_RPM;
  delete process.env.GEMINI_RPD;
});

const answer = (text: string) => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 12 } },
});

const ask = (feature: 'assistant' | 'moderation' = 'assistant') =>
  generate({ feature, system: 'Be brief.', contents: [{ role: 'user', parts: [{ text: 'hello' }] }] });

describe('the Gemini client', () => {
  it('is off, and refuses to call, without a key', async () => {
    let called = false;
    setGeminiTransportForTesting(async () => {
      called = true;
      return answer('hi');
    });
    expect(geminiEnabled()).toBe(false);
    await expect(ask()).rejects.toMatchObject({ kind: 'disabled' });
    expect(called).toBe(false);
  });

  it('sends the key in a header, never in the address', async () => {
    process.env.GEMINI_API_KEY = 'test-key-123';
    const seen: { url: string; apiKey: string }[] = [];
    setGeminiTransportForTesting(async (url, _body, init) => {
      seen.push({ url, apiKey: init.apiKey });
      return answer('Hello!');
    });
    const result = await ask();
    expect(result.text).toBe('Hello!');
    expect(seen[0]?.apiKey).toBe('test-key-123');
    expect(seen[0]?.url).not.toContain('test-key-123');
    expect(seen[0]?.url).toMatch(/:generateContent$/);
  });

  it('returns tool calls, and keeps the parts whole for the next step', async () => {
    process.env.GEMINI_API_KEY = 'k';
    setGeminiTransportForTesting(async () => ({
      status: 200,
      body: {
        candidates: [
          { content: { parts: [{ functionCall: { name: 'search_books', args: { query: 'x' } }, thoughtSignature: 'sig' }] } },
        ],
      },
    }));
    const result = await ask();
    expect(result.functionCalls).toEqual([{ name: 'search_books', args: { query: 'x' } }]);
    expect(result.parts[0]?.thoughtSignature).toBe('sig');
  });

  it('retries a busy API once for the assistant, then gives up with a kind to fall back on', async () => {
    process.env.GEMINI_API_KEY = 'k';
    let calls = 0;
    setGeminiTransportForTesting(async () => {
      calls += 1;
      return { status: 503, body: {} };
    });
    await expect(ask()).rejects.toMatchObject({ kind: 'unavailable' });
    expect(calls).toBe(2);
  });

  it('does not retry a request the API refuses outright', async () => {
    process.env.GEMINI_API_KEY = 'k';
    let calls = 0;
    setGeminiTransportForTesting(async () => {
      calls += 1;
      return { status: 400, body: {} };
    });
    await expect(ask()).rejects.toMatchObject({ kind: 'invalid' });
    expect(calls).toBe(1);
  });

  it('turns a blocked or empty answer into an error rather than an empty reply', async () => {
    process.env.GEMINI_API_KEY = 'k';
    setGeminiTransportForTesting(async () => ({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } }));
    await expect(ask()).rejects.toMatchObject({ kind: 'blocked' });
    setGeminiTransportForTesting(async () => ({ status: 200, body: { candidates: [{ content: { parts: [] } }] } }));
    await expect(ask()).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('keeps to the per-minute budget, and gives moderation only its share', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_RPM = '5';
    setGeminiTransportForTesting(async () => answer('ok'));
    // 20% of 5 is one call a minute for moderation.
    await ask('moderation');
    await expect(ask('moderation')).rejects.toMatchObject({ kind: 'rate_limited' });
    // The assistant has the rest.
    for (let i = 0; i < 4; i += 1) await ask('assistant');
    await expect(ask('assistant')).rejects.toBeInstanceOf(GeminiError);
  });

  it('keeps to the daily budget, which survives a restart', async () => {
    process.env.GEMINI_API_KEY = 'k';
    process.env.GEMINI_RPD = '2';
    setGeminiTransportForTesting(async () => answer('ok'));
    await ask();
    resetGeminiBudgetForTesting(); // a restart forgets the minute, not the day
    await ask();
    resetGeminiBudgetForTesting();
    await expect(ask()).rejects.toMatchObject({ kind: 'budget' });
  });

  it('embeds texts in order, and refuses an answer of the wrong shape', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const transport: GeminiTransport = async (url) => {
      expect(url).toMatch(/:batchEmbedContents$/);
      return { status: 200, body: { embeddings: [{ values: [1, 0] }, { values: [0, 1] }] } };
    };
    setGeminiTransportForTesting(transport);
    expect(await embed(['a', 'b'])).toEqual([[1, 0], [0, 1]]);
    await expect(embed(['a', 'b', 'c'])).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('reads JSON answers, with or without a code fence, and nothing else', () => {
    expect(parseJsonAnswer('{"label":"ok"}')).toEqual({ label: 'ok' });
    expect(parseJsonAnswer('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonAnswer('not json')).toBeNull();
  });
});

describe('contact details', () => {
  it('reads Bangla digits as digits', () => {
    expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
  });

  it('finds Bangladeshi numbers, e-mail addresses and links, in either script', () => {
    const found = findContactDetails('Call ০১৭১২-৩৪৫৬৭৮ or +880 1812 345678, mail me@x.com, see www.cheap-books.xyz');
    expect(found.phones).toHaveLength(2);
    expect(found.emails).toEqual(['me@x.com']);
    expect(found.links).toHaveLength(1);
  });

  it('leaves an ISBN, a price and an ordinary sentence alone', () => {
    const text = 'ISBN 978-984-8040-12-3, price 350 taka, a lovely novel.';
    expect(findContactDetails(text)).toEqual({ phones: [], emails: [], links: [] });
    expect(stripContactDetails(text)).toBe(text);
  });

  it('reads a number spelled out in words, in either language, and leaves short runs alone', () => {
    expect(findContactDetails('Reach me on zero one seven one two three four five six seven eight').phones).toHaveLength(1);
    expect(findContactDetails('শূন্য এক সাত এক দুই তিন চার পাঁচ ছয় সাত আট এ ফোন দিন').phones).toHaveLength(1);
    expect(findContactDetails('one or two copies, at eight o’clock, seven of nine').phones).toEqual([]);
    expect(stripContactDetails('call zero one eight one two three four five six seven eight now')).toBe('call [number] now');
  });

  it('stays fast on a long run of odd characters', () => {
    const started = Date.now();
    findContactDetails(`${'%'.repeat(5000)}@${'a.'.repeat(2000)}`);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('replaces them with placeholders for the model', () => {
    expect(stripContactDetails('bkash 01712345678 or a@b.com')).toBe('bkash [number] or [email]');
  });
});
