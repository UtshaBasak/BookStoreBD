import { createHash } from 'crypto';

import type { AssistantReply, AssistantTurn, Book } from '@shared/api.js';

import AssistantStat from '../../models/AssistantStat.model.js';
import { findCatalogue } from '../../controllers/filter.controller.js';
import { SUPPORT_EMAIL } from '../../config/contact.js';
import { OUT_OF_SCOPE, assistantSystemPrompt, outOfScopeReply } from '../../prompts/assistant.js';
import { createLogger } from '../../config/logger.js';
import { GeminiError, generate, geminiEnabled, type GeminiContent, type GeminiPart } from '../gemini.js';
import { stripContactDetails } from '../contactDetails.js';
import { bnDigits, type Language } from '../language.js';
import { dhakaDay } from '../usageCounter.js';
import { securityEvent, type SecurityRequest } from '../securityLog.js';
import { withCoverUrls } from '../projections.js';
import { searchKnowledge } from './retrieval.js';
import { emptyCollected, runTool, toolDeclarations, type Collected, type ToolContext } from './tools.js';

const log = createLogger('assistant');

/**
 * The shopping assistant: one question in, one answer out.
 *
 * Cheapest first. A request that is plainly not about the shop, or that tries
 * to get at the instructions, is answered here without the model. The model
 * is then given the question and tools that run the site's own code, for at
 * most three tool calls. Whatever it says is cleaned to plain text, and the
 * books, links and orders under the answer come from the tools, never from
 * its words. If the model is off, busy or over budget, the answer is built
 * from the help text and the catalogue search alone.
 */

export interface AskInput {
  message: string;
  history: AssistantTurn[];
  seen: string[];
  /** From the session; undefined for a visitor. */
  email?: string;
  firstName?: string;
  /** The site language the person is using. */
  siteLanguage: Language;
  requestId: string;
  /** Who to count repeats against: the account, or the address. */
  abuseKey: string;
  /** For security events. */
  req?: SecurityRequest;
}

const MAX_TOOL_CALLS = 3;
const MAX_REPLY_CHARS = 1500;

// --------------------------------------------------------------- language

const BANGLA = /[ঀ-৿]/;
const BANGLISH = /\b(ami|amar|apni|apnar|koto|kivabe|kemne|ache|achhe|nai|boi|bai|kinbo|kinte|chai|lagbe|takay|kobe|kothay|keno|hobe|korbo|kori|valo|bhalo|dhonnobad|ki)\b/i;

/** Bangla for Bangla script or Banglish, English for English, the site's language when it cannot tell. */
export const languageOfQuestion = (message: string, siteLanguage: Language): Language => {
  if (BANGLA.test(message)) return 'bn';
  if (BANGLISH.test(message)) return 'bn';
  if (/[a-z]{3,}/i.test(message)) return 'en';
  return siteLanguage;
};

// ------------------------------------------------- answered without the model

const BOOKISH = /\b(books?|novels?|authors?|writers?|titles?|isbn|edition|publishers?|boi|bai|uponnash|kobita\s*boi|order|delivery|return|refund|price|taka|tk|sell|seller|buy|shop|stock|cart|wishlist|bookstorebd)\b|বই|লেখক|উপন্যাস|অর্ডার|ডেলিভারি|দাম|টাকা|বিক্রি|কিনতে|কিনব|রিটার্ন|দোকান|শপ/i;

/*
 * The usual general-purpose requests, which this assistant does not take on.
 * A message that also mentions books ("a book about python") is let through.
 */
const GENERAL = [
  /\b(write|compose|draft|generate)\b.{0,40}\b(essay|poem|story|code|program|script|letter|email|paragraph|cv|resume|caption|speech|summary)\b/i,
  /\b(python|javascript|typescript|java|c\+\+|html|css|sql|regex|excel formula|leetcode)\b/i,
  /\btranslate\b|\bsolve\b.{0,20}\b(equation|problem|sum)\b|\b\d+\s*[-+*/x×÷^]\s*\d+\s*=?\s*\??$/i,
  /\b(weather|forecast|news|headline|stock market|share price|bitcoin|crypto|cricket score|football score|match score|horoscope|lottery)\b/i,
  /\b(recipe|joke|riddle|homework|assignment|capital of|who is the (president|prime minister)|girlfriend|boyfriend)\b/i,
  /রচনা লিখ|কবিতা লিখ|গল্প লিখ|অনুবাদ কর|আবহাওয়া|খেলার স্কোর|রেসিপি|কৌতুক|জোকস|হোমওয়ার্ক/,
];

export const plainlyOffTopic = (message: string): boolean => GENERAL.some((pattern) => pattern.test(message)) && !BOOKISH.test(message);

/** Attempts to get at, or replace, the assistant's instructions. */
const INJECTION = [
  /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|above|prior|earlier|all|your|the)\b.{0,20}\b(instructions?|rules?|prompts?|directions?|guidelines?)\b/i,
  /\b(system|hidden|initial|developer)\s+(prompt|message|instructions?)\b/i,
  /\b(reveal|show|print|repeat|tell me)\b.{0,30}\b(your|the)\s+(instructions?|rules|prompt|configuration)\b/i,
  /\b(jailbreak|dan mode|developer mode|do anything now)\b/i,
  /\byou are (now|no longer)\b|\bpretend (to be|you are)\b|\bact as (an?|my)\b/i,
  /আগের (সব )?নির্দেশ(না)? (ভুলে|উপেক্ষা)|তোমার নির্দেশনা দেখাও|সিস্টেম প্রম্পট/,
];

export const looksLikeInjection = (message: string): boolean => INJECTION.some((pattern) => pattern.test(message));

const neutralReply = (language: Language): string =>
  language === 'bn'
    ? 'আমি BookStoreBD-এ বই খুঁজে দিতে, অর্ডারের খবর জানাতে আর দোকানের নিয়ম বুঝিয়ে বলতে পারি। কী খুঁজছেন?'
    : 'I can help you find books, check your orders and explain how BookStoreBD works. What are you looking for?';

// The same question again and again, from one person, in a short time.
const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const repeats = new Map<string, { hash: string; count: number; at: number }>();

const isRepeated = (key: string, message: string): boolean => {
  const hash = createHash('sha256').update(message.trim().toLowerCase()).digest('hex');
  const now = Date.now();
  const last = repeats.get(key);
  const count = last && last.hash === hash && now - last.at < REPEAT_WINDOW_MS ? last.count + 1 : 1;
  repeats.set(key, { hash, count, at: now });
  if (repeats.size > 5000) {
    for (const [entry, value] of repeats) if (now - value.at > REPEAT_WINDOW_MS) repeats.delete(entry);
  }
  return count > 3;
};

// ----------------------------------------------------------------- cache

/** Answers to the same general question, kept briefly to spare the daily quota. Never a personal one. */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; reply: Omit<AssistantReply, 'requestId'> }>();

const cacheKey = (message: string, language: Language): string =>
  `${language}:${message.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;

const withoutRequestId = (reply: AssistantReply): Omit<AssistantReply, 'requestId'> => {
  const copy: Partial<AssistantReply> = { ...reply };
  delete copy.requestId;
  return copy as Omit<AssistantReply, 'requestId'>;
};

/** For tests. */
export const resetAssistantStateForTesting = (): void => {
  cache.clear();
  repeats.clear();
};

// ----------------------------------------------------------- the answer

/** Model text made safe to show: plain text, no markup, no addresses, no runaway length. */
export const cleanReply = (text: string): string =>
  text
    .replace(/<[^>]*>/g, '')
    // Whatever is left of a broken or nested tag: no angle bracket survives.
    .replace(/[<>]/g, '')
    // [label](address) keeps the label; the address is dropped.
    .replace(/\[([^\]]{1,200})\]\([^)]*\)/g, '$1')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_REPLY_CHARS);

const bump = (fields: Partial<Record<'questions' | 'fallbacks' | 'handovers' | 'outOfScope' | 'helpful' | 'unhelpful', number>>): void => {
  AssistantStat.updateOne(
    { day: dhakaDay() },
    { $inc: fields, $setOnInsert: { expiresAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000) } },
    { upsert: true }
  ).catch((error: unknown) => log.warn({ err: error }, 'Could not count an assistant answer'));
};

export const countFeedback = (helpful: boolean): void => bump(helpful ? { helpful: 1 } : { unhelpful: 1 });

const replyFrom = (
  input: AskInput,
  language: Language,
  text: string,
  collected: Collected,
  flags: { fallback?: boolean; outOfScope?: boolean } = {}
): AssistantReply => ({
  requestId: input.requestId,
  reply: text,
  language,
  books: collected.books,
  links: collected.links.slice(0, 5),
  orders: collected.orders,
  handover: collected.handover,
  wanted: collected.wanted,
  fallback: Boolean(flags.fallback),
  outOfScope: Boolean(flags.outOfScope),
});

/**
 * An answer without the model: the help topic that matches, or books that
 * match, with the pages to go to and a person to ask.
 */
const fallbackAnswer = async (input: AskInput, language: Language, collected: Collected): Promise<AssistantReply> => {
  const say = (en: string, bn: string) => (language === 'bn' ? bn : en);
  const question = stripContactDetails(input.message).slice(0, 100);
  const parts: string[] = [say('The assistant cannot think right now, but here is what I found.', 'সহকারী এই মুহূর্তে ব্যস্ত, তবে যা পেলাম তা দিলাম।')];

  const help = searchKnowledge(question, 1)[0];
  if (help && help.score >= 3) {
    parts.push(help.chunk.text[language]);
    collected.links.push({ href: help.chunk.link, label: help.chunk.title[language] });
  } else if (!collected.books.length && question.trim().length >= 2) {
    try {
      const { items, total } = await findCatalogue({ search: question, sort: 'relevant', page: 1, pageSize: 6 });
      collected.books = items.map((book) => withCoverUrls(book) as unknown as Book);
      if (total) parts.push(say(`${total} books match your words.`, `আপনার কথার সঙ্গে মেলে এমন ${bnDigits(total)}টি বই পাওয়া গেছে।`));
    } catch (error) {
      log.warn({ err: error }, 'Fallback search failed');
    }
  }
  if (question.trim()) {
    collected.links.push({ href: `/filter?${new URLSearchParams({ search: question })}`, label: say('Search the shop', 'শপে খুঁজুন') });
  }
  collected.links.push({ href: '/how-it-works', label: say('How it works', 'কীভাবে কাজ করে') });
  collected.handover ??= { kind: 'shop', chatWith: null, name: 'BookStoreBD', bookTitle: null, email: SUPPORT_EMAIL };
  bump({ fallbacks: 1 });
  return replyFrom(input, language, parts.join(' '), collected, { fallback: true });
};

/** The history as the model reads it: text only, contact details removed, the last few turns. */
const historyAsContents = (history: AssistantTurn[]): GeminiContent[] =>
  history.slice(-6).map((turn) => ({
    role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: stripContactDetails(turn.text).slice(0, 600) }],
  }));

export const answerQuestion = async (input: AskInput): Promise<AssistantReply> => {
  const language = languageOfQuestion(input.message, input.siteLanguage);
  const collected = emptyCollected();
  bump({ questions: 1 });

  if (isRepeated(input.abuseKey, input.message)) {
    securityEvent(input.req, 'assistant.abuse', { reason: 'repeated_question' });
    return replyFrom(input, language, neutralReply(language), collected);
  }
  if (looksLikeInjection(input.message)) {
    securityEvent(input.req, 'assistant.injection_suspected', { reason: 'instruction_override' });
    return replyFrom(input, language, neutralReply(language), collected);
  }
  if (plainlyOffTopic(input.message)) {
    bump({ outOfScope: 1 });
    return replyFrom(input, language, outOfScopeReply(language), collected, { outOfScope: true });
  }
  if (!geminiEnabled()) return fallbackAnswer(input, language, collected);

  // A general question asked again, word for word, gets the same answer.
  const personal = Boolean(input.email || input.seen.length || input.history.length);
  const key = cacheKey(input.message, language);
  const cached = personal ? undefined : cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return { ...cached.reply, requestId: input.requestId };

  const context: ToolContext = { language, email: input.email, seen: input.seen };
  const system = assistantSystemPrompt({
    language,
    signedIn: Boolean(input.email),
    firstName: input.firstName,
    today: dhakaDay(),
  });
  const tools = toolDeclarations(Boolean(input.email));
  const contents: GeminiContent[] = [
    ...historyAsContents(input.history),
    { role: 'user', parts: [{ text: stripContactDetails(input.message) }] },
  ];

  const usedTools: string[] = [];
  try {
    for (let step = 0; step <= MAX_TOOL_CALLS; step += 1) {
      const lastStep = usedTools.length >= MAX_TOOL_CALLS;
      const result = await generate({
        feature: 'assistant',
        purpose: lastStep ? 'answer' : 'step',
        system,
        contents,
        tools,
        toolMode: lastStep ? 'none' : 'auto',
        maxOutputTokens: 600,
      });

      if (!result.functionCalls.length || lastStep) {
        const raw = result.text;
        if (raw.includes(OUT_OF_SCOPE)) {
          bump({ outOfScope: 1 });
          return replyFrom(input, language, outOfScopeReply(language), emptyCollected(), { outOfScope: true });
        }
        const text = cleanReply(raw) || neutralReply(language);
        if (collected.handover) bump({ handovers: 1 });
        const reply = replyFrom(input, language, text, collected);
        if (!personal && usedTools.every((name) => name === 'shop_help' || name === 'browse_shop')) {
          cache.set(key, { at: Date.now(), reply: withoutRequestId(reply) });
          if (cache.size > 300) cache.delete(cache.keys().next().value ?? '');
        }
        log.info({ request_id: input.requestId, tools: usedTools, books: collected.books.length, language }, 'Assistant answered');
        return reply;
      }

      // The model's turn goes back whole, thought signatures and all.
      contents.push({ role: 'model', parts: result.parts });
      const responses: GeminiPart[] = [];
      for (const call of result.functionCalls) {
        if (usedTools.length >= MAX_TOOL_CALLS) {
          responses.push({ functionResponse: { name: call.name, response: { error: 'Tool limit reached. Answer now.' } } });
          continue;
        }
        usedTools.push(call.name);
        const output = await runTool(call.name, call.args, context, collected);
        // Labelled as data, so text inside it is read, not obeyed.
        responses.push({ functionResponse: { name: call.name, response: { data_from_bookstorebd: output } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (error) {
    if (!(error instanceof GeminiError)) log.error({ err: error, request_id: input.requestId }, 'Assistant failed');
  }
  return fallbackAnswer(input, language, collected);
};
