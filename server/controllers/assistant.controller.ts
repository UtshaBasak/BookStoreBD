import { createHmac } from 'crypto';

import type { RequestHandler } from 'express';

import type { AssistantConfig } from '@shared/api.js';

import AssistantFeedback from '../models/AssistantFeedback.model.js';
import { assistantSettings, jwtSecret } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import type { AssistantChatBody, AssistantFeedbackBody } from '../schemas/index.js';
import { answerQuestion, countFeedback } from '../utils/assistant/engine.js';
import { geminiEnabled } from '../utils/gemini.js';
import { isDuplicateKeyError } from '../utils/error.js';
import { languageOf, t } from '../utils/language.js';
import { securityEvent } from '../utils/securityLog.js';
import { addUsage, dhakaDay } from '../utils/usageCounter.js';

const log = createLogger('assistant');

/** Whether the assistant is offered: the Gemini key is set and it is not switched off. */
export const assistantOn = (): boolean => geminiEnabled() && assistantSettings().enabled;

/** GET /assistant/config */
export const assistantConfig: RequestHandler = (_req, res) => {
  const body: AssistantConfig = { enabled: assistantOn() };
  res.set('Cache-Control', 'no-store').json(body);
};

/** A keyed hash, so the daily counts name no address or account in plain text. */
const bucket = (kind: string, value: string): string =>
  `assistant:${kind}:${createHmac('sha256', jwtSecret()).update(`assistant:${value}`).digest('hex').slice(0, 32)}:${dhakaDay()}`;

/** POST /assistant/chat */
export const chat: RequestHandler = async (req, res) => {
  if (!assistantOn()) {
    res.status(503).json({ code: 'assistant-off', message: t(req, 'The assistant is not available.', 'সহকারী এখন চালু নেই।') });
    return;
  }
  const { message, history, seen } = req.body as AssistantChatBody;
  const user = req.user ?? undefined;
  const settings = assistantSettings();

  try {
    // A day's questions, per account or - for a visitor - per address.
    const used = user ? await addUsage(bucket('user', user.id)) : await addUsage(bucket('ip', req.ip ?? 'unknown'));
    if (used > (user ? settings.perUserDaily : settings.perIpDaily)) {
      securityEvent(req, 'assistant.abuse', { reason: 'daily_cap', extra: { signed_in: Boolean(user) } });
      res.status(429).json({
        code: 'assistant-daily-limit',
        message: t(
          req,
          'You have asked a lot of questions today. Please use the search or the help pages, or try again tomorrow.',
          'আজ অনেক প্রশ্ন করা হয়েছে। খোঁজার ঘর বা সাহায্যের পাতা ব্যবহার করুন, অথবা কাল আবার চেষ্টা করুন।'
        ),
      });
      return;
    }

    const reply = await answerQuestion({
      message,
      history,
      seen,
      email: user?.email,
      firstName: user?.username,
      siteLanguage: languageOf(req),
      requestId: String(req.id ?? ''),
      abuseKey: user ? `u:${user.id}` : `ip:${req.ip ?? ''}`,
      req,
    });
    res.set('Cache-Control', 'no-store').status(200).json(reply);
  } catch (error) {
    log.error({ err: error }, 'Assistant request failed');
    res.status(500).json({ message: t(req, 'The assistant could not answer. Please try again.', 'সহকারী উত্তর দিতে পারেনি। আবার চেষ্টা করুন।') });
  }
};

/** POST /assistant/feedback - a thumbs up or down, once per answer. */
export const feedback: RequestHandler = async (req, res) => {
  const { requestId, helpful, reason } = req.body as AssistantFeedbackBody;
  try {
    await AssistantFeedback.create({ requestId, helpful, reason: reason ?? null, signedIn: Boolean(req.user) });
    countFeedback(helpful);
    res.status(201).json({ ok: true });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      res.status(200).json({ ok: true });
      return;
    }
    log.error({ err: error }, 'Assistant feedback failed');
    res.status(500).json({ message: t(req, 'Could not save that.', 'এটি সংরক্ষণ করা যায়নি।') });
  }
};
