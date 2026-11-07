import { createLogger } from '../config/logger.js';
import { geminiSettings, type GeminiSettings } from '../config/env.js';
import { addUsage, dhakaDay, usageOf } from './usageCounter.js';

const log = createLogger('gemini');

/**
 * The one place that talks to the Gemini API. Everything else - the shopping
 * assistant, moderation - calls this, never the API, so the key, the time
 * limits, the retries and the shop-wide budget live in one module.
 *
 * Plain HTTPS rather than Google's SDK, as the bot check and the Gmail API
 * are: the REST shape is stable, and a test replaces one function
 * (`setGeminiTransportForTesting`) instead of mocking a library. The key goes
 * in a header, never in the address, so no proxy or error log can capture it.
 *
 * Nothing about a prompt or an answer is logged except its size: the feature,
 * the model, how long it took, the token counts, the tools it asked for and
 * the outcome.
 */

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiFeature = 'assistant' | 'moderation';

/** One part of a turn, as the API writes it. Kept whole, so a thought signature goes back unchanged. */
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
  thoughtSignature?: string;
  thought?: boolean;
  [key: string]: unknown;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export interface GenerateRequest {
  feature: GeminiFeature;
  system: string;
  contents: GeminiContent[];
  tools?: GeminiFunctionDeclaration[];
  /** `none` stops the model calling a tool, for the last step of a turn. */
  toolMode?: 'auto' | 'any' | 'none';
  /** A JSON answer in this shape (the API's OpenAPI-style schema). */
  responseSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  /** Turns the API's own safety filters off, for moderation, which must read abusive text to label it. */
  readAbusiveText?: boolean;
  /** For the log only: why this call was made. */
  purpose?: string;
}

export interface GenerateResult {
  parts: GeminiPart[];
  text: string;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  finishReason: string | null;
  usage: { prompt: number; output: number; total: number };
}

export type GeminiErrorKind = 'disabled' | 'budget' | 'rate_limited' | 'unavailable' | 'blocked' | 'invalid';

/** Why a call did not produce an answer. Callers fall back on `kind`, never on the message. */
export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiErrorKind,
    message: string,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export interface TransportResponse {
  status: number;
  body: unknown;
}

/** How a request reaches the API. Replaced in tests, so CI never calls Google. */
export type GeminiTransport = (url: string, body: unknown, init: { apiKey: string; timeoutMs: number }) => Promise<TransportResponse>;

const fetchTransport: GeminiTransport = async (url, body, { apiKey, timeoutMs }) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const parsed: unknown = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
};

let transport: GeminiTransport = fetchTransport;

/** A test seam: requests go to the test's function instead of Google, or back to Google. */
export const setGeminiTransportForTesting = (replacement: GeminiTransport | null): void => {
  transport = replacement ?? fetchTransport;
};

/** Whether the model can be used at all: a key is set. */
export const geminiEnabled = (): boolean => Boolean(geminiSettings().apiKey);

// ------------------------------------------------------------------ budget

/** Calls in the last minute, per feature, newest last. In memory: a minute does not outlive a restart. */
const recent: Record<GeminiFeature, number[]> = { assistant: [], moderation: [] };

const MINUTE_MS = 60_000;

const inLastMinute = (feature: GeminiFeature, now: number): number => {
  const list = recent[feature];
  while (list.length && now - (list[0] ?? 0) >= MINUTE_MS) list.shift();
  return list.length;
};

/** The ceilings a feature works under: moderation its share, the assistant all of it. */
const ceilingsFor = (feature: GeminiFeature, settings: GeminiSettings): { perMinute: number; perDay: number } =>
  feature === 'moderation'
    ? {
        perMinute: Math.floor(settings.requestsPerMinute * settings.moderationShare),
        perDay: Math.floor(settings.requestsPerDay * settings.moderationShare),
      }
    : { perMinute: settings.requestsPerMinute, perDay: settings.requestsPerDay };

const dayKey = (feature: GeminiFeature | 'all', now: number): string => `gemini:${feature}:${dhakaDay(now)}`;

/**
 * Takes one call from the budget, or says why not. The assistant may use the
 * whole budget, moderation only its share - and moderation also stops while
 * the assistant is busy, so a shopper is never kept waiting by a background job.
 */
const reserve = async (feature: GeminiFeature, settings: GeminiSettings): Promise<void> => {
  const now = Date.now();
  const ceiling = ceilingsFor(feature, settings);
  const minuteTotal = inLastMinute('assistant', now) + inLastMinute('moderation', now);
  if (ceiling.perMinute < 1 || inLastMinute(feature, now) >= ceiling.perMinute || minuteTotal >= settings.requestsPerMinute) {
    const oldest = Math.min(recent.assistant[0] ?? now, recent.moderation[0] ?? now);
    throw new GeminiError('rate_limited', 'Per-minute budget used', Math.max(1000, MINUTE_MS - (now - oldest)));
  }
  const [mine, all] = await Promise.all([usageOf(dayKey(feature, now)), usageOf(dayKey('all', now))]);
  if (mine >= ceiling.perDay || all >= settings.requestsPerDay) {
    throw new GeminiError('budget', 'Daily budget used');
  }
  recent[feature].push(now);
  await Promise.all([addUsage(dayKey(feature, now)), addUsage(dayKey('all', now))]);
};

/** For tests: forget the calls of the last minute. */
export const resetGeminiBudgetForTesting = (): void => {
  recent.assistant = [];
  recent.moderation = [];
  active = 0;
  waiting.splice(0);
};

/** How much of today's budget each feature has used, for the admin analytics. */
export const geminiUsageToday = async (): Promise<{ assistant: number; moderation: number; limit: number }> => {
  const now = Date.now();
  const [assistant, moderation] = await Promise.all([usageOf(dayKey('assistant', now)), usageOf(dayKey('moderation', now))]);
  return { assistant, moderation, limit: geminiSettings().requestsPerDay };
};

// ------------------------------------------------------------- concurrency

let active = 0;
const waiting: (() => void)[] = [];

const acquire = async (max: number): Promise<void> => {
  if (active < max) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
};

const release = (): void => {
  active = Math.max(0, active - 1);
  waiting.shift()?.();
};

// ------------------------------------------------------------------ calling

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The wait Google asks for in a 429, if it gives one (`RetryInfo`). */
const retryDelayOf = (body: unknown): number | undefined => {
  const details = (body as { error?: { details?: { '@type'?: string; retryDelay?: string }[] } } | null)?.error?.details;
  const info = details?.find((detail) => detail['@type']?.endsWith('RetryInfo'));
  const seconds = info?.retryDelay ? Number.parseFloat(info.retryDelay) : NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
};

/**
 * One request, with a retry or two on a busy or failing API. The assistant is
 * answering a person, so it retries once, quickly; moderation can wait.
 */
const send = async (feature: GeminiFeature, url: string, body: unknown, settings: GeminiSettings): Promise<unknown> => {
  const apiKey = settings.apiKey;
  if (!apiKey) throw new GeminiError('disabled', 'GEMINI_API_KEY is not set');
  const attempts = feature === 'assistant' ? 2 : 3;
  let lastError: GeminiError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: TransportResponse;
    try {
      response = await transport(url, body, { apiKey, timeoutMs: settings.timeoutMs });
    } catch {
      lastError = new GeminiError('unavailable', 'Request failed or timed out');
      if (attempt < attempts) await sleep(400 * 2 ** attempt);
      continue;
    }
    if (response.status >= 200 && response.status < 300) return response.body;
    if (response.status === 429) {
      const wait = retryDelayOf(response.body);
      lastError = new GeminiError('rate_limited', 'Rate limited by the API', wait);
      // A long wait is the daily quota, not a busy minute: give up now.
      if (attempt < attempts && (wait ?? 0) <= 5000) await sleep(wait ?? 800 * 2 ** attempt);
      else break;
      continue;
    }
    if (response.status >= 500) {
      lastError = new GeminiError('unavailable', `API error ${response.status}`);
      if (attempt < attempts) await sleep(400 * 2 ** attempt);
      continue;
    }
    // 400, 401, 403, 404: a request that will never succeed as it is.
    throw new GeminiError('invalid', `API refused the request (${response.status})`);
  }
  throw lastError ?? new GeminiError('unavailable', 'No answer');
};

const SAFETY_CATEGORIES = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
];

interface RawResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

/**
 * Asks the model for one step: text, tool calls, or JSON in a given shape.
 * Throws a `GeminiError` the caller can fall back on; never anything else.
 */
export const generate = async (request: GenerateRequest): Promise<GenerateResult> => {
  const settings = geminiSettings();
  if (!settings.apiKey) throw new GeminiError('disabled', 'GEMINI_API_KEY is not set');
  const model = request.feature === 'moderation' ? settings.moderationModel : settings.model;
  const started = Date.now();

  await reserve(request.feature, settings);

  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.contents,
    ...(request.tools?.length
      ? {
          tools: [{ functionDeclarations: request.tools }],
          toolConfig: { functionCallingConfig: { mode: (request.toolMode ?? 'auto').toUpperCase() } },
        }
      : {}),
    ...(request.readAbusiveText
      ? { safetySettings: SAFETY_CATEGORIES.map((category) => ({ category, threshold: 'BLOCK_NONE' })) }
      : {}),
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens ?? 800,
      temperature: request.temperature ?? 0.2,
      ...(settings.thinkingLevel ? { thinkingConfig: { thinkingLevel: settings.thinkingLevel.toUpperCase() } } : {}),
      ...(request.responseSchema ? { responseMimeType: 'application/json', responseSchema: request.responseSchema } : {}),
    },
  };

  let outcome = 'ok';
  let usage = { prompt: 0, output: 0, total: 0 };
  let toolNames: string[] = [];
  await acquire(settings.maxConcurrent);
  try {
    const raw = (await send(request.feature, `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, body, settings)) as RawResponse | null;
    usage = {
      prompt: raw?.usageMetadata?.promptTokenCount ?? 0,
      output: raw?.usageMetadata?.candidatesTokenCount ?? 0,
      total: raw?.usageMetadata?.totalTokenCount ?? 0,
    };
    if (raw?.promptFeedback?.blockReason) throw new GeminiError('blocked', `Blocked: ${raw.promptFeedback.blockReason}`);
    const candidate = raw?.candidates?.[0];
    const finishReason = candidate?.finishReason ?? null;
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT' || finishReason === 'BLOCKLIST') {
      throw new GeminiError('blocked', `Answer withheld: ${finishReason}`);
    }
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const functionCalls = parts
      .filter((part) => part.functionCall?.name)
      .map((part) => ({ name: String(part.functionCall?.name), args: (part.functionCall?.args ?? {}) as Record<string, unknown> }));
    toolNames = functionCalls.map((call) => call.name);
    const text = parts
      .filter((part) => typeof part.text === 'string' && !part.thought)
      .map((part) => part.text)
      .join('')
      .trim();
    if (!text && !functionCalls.length) throw new GeminiError('invalid', `Empty answer (${finishReason ?? 'no candidate'})`);
    return { parts, text, functionCalls, finishReason, usage };
  } catch (error) {
    const failure = error instanceof GeminiError ? error : new GeminiError('unavailable', 'Unexpected failure');
    outcome = failure.kind;
    throw failure;
  } finally {
    release();
    log.info(
      {
        feature: request.feature,
        purpose: request.purpose,
        model,
        latency_ms: Date.now() - started,
        tokens: usage,
        tools: toolNames,
        outcome,
      },
      'Gemini call'
    );
  }
};

/** Pulls the JSON out of an answer asked for in JSON, or null if it is not JSON. */
export const parseJsonAnswer = (text: string): unknown => {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

/**
 * Vectors for some texts, in order, for the meaning-based book search. Uses
 * the moderation share of the budget: it runs in the background, never while
 * a shopper waits - except for the one short query a search embeds, which is
 * the assistant's.
 */
export const embed = async (texts: string[], { feature = 'moderation' as GeminiFeature, purpose = 'embed' } = {}): Promise<number[][]> => {
  const settings = geminiSettings();
  if (!settings.apiKey) throw new GeminiError('disabled', 'GEMINI_API_KEY is not set');
  if (!texts.length) return [];
  const model = settings.embeddingModel;
  const started = Date.now();
  await reserve(feature, settings);
  let outcome = 'ok';
  await acquire(settings.maxConcurrent);
  try {
    const raw = (await send(feature, `${API_ROOT}/models/${encodeURIComponent(model)}:batchEmbedContents`, {
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text: text.slice(0, 2000) }] },
        outputDimensionality: 256,
      })),
    }, settings)) as { embeddings?: { values?: number[] }[] } | null;
    const vectors = (raw?.embeddings ?? []).map((row) => (Array.isArray(row.values) ? row.values : []));
    if (vectors.length !== texts.length || vectors.some((vector) => !vector.length)) {
      throw new GeminiError('invalid', 'Embedding answer had the wrong shape');
    }
    return vectors;
  } catch (error) {
    const failure = error instanceof GeminiError ? error : new GeminiError('unavailable', 'Unexpected failure');
    outcome = failure.kind;
    throw failure;
  } finally {
    release();
    log.info({ feature, purpose, model, latency_ms: Date.now() - started, items: texts.length, outcome }, 'Gemini embedding');
  }
};
