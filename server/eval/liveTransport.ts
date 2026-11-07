import type { GeminiTransport } from '../utils/gemini.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The real Gemini transport (the same request `utils/gemini.ts` makes), with
 * at least `paceMs` between one request and the next.
 *
 * Pacing is per request, not per question: a question that calls three tools
 * makes four requests, and the free tier counts requests. `inspect` sees each
 * request body first, for the evaluation to read the tool results in it.
 */
export const pacedLiveTransport = (paceMs: number, inspect?: (body: unknown) => void): GeminiTransport => {
  let lastAt = 0;
  return async (url, body, { apiKey, timeoutMs }) => {
    const wait = lastAt + paceMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    inspect?.(body);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed: unknown = await res.json().catch(() => null);
    return { status: res.status, body: parsed };
  };
};

export const DEFAULT_PACE_MS = 6500;
