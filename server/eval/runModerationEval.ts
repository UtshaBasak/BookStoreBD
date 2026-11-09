/**
 * Scores automatic moderation against the labelled items.
 *
 * The rule layer is run for real - the same `reviewReasons`, `listingReasons`
 * and `chatReasons` the worker runs - against rows seeded into the current
 * (disposable) database, so the rules that look at other rows (duplicates,
 * bursts, comparable prices, shared photos, a sender's day of messages) have
 * something to look at.
 *
 * The model layer is run through the real `modelReasons`: offline against
 * recorded labels, live against Gemini. It only ever sees public text. Chat
 * is private and never goes near it - this file filters chat out before the
 * model layer can be asked about it, as the product does.
 */
import mongoose from 'mongoose';

import AddBook, { type LeanBook } from '../models/AddBook.model.js';
import ChatMessage from '../models/Chat.model.js';
import Review from '../models/Review.model.js';
import User from '../models/user.model.js';
import { MODERATION_LABELS, type ModerationLabel } from '../prompts/moderation.js';
import { resetGeminiBudgetForTesting, setGeminiTransportForTesting } from '../utils/gemini.js';
import { chatReasons, listingReasons, reviewReasons } from '../utils/moderation/rules.js';
import { modelReasons } from '../utils/moderation/model.js';
import { DEFAULT_PACE_MS, pacedLiveTransport } from './liveTransport.js';
import { MODERATION_CASES, type ChatCase, type ListingCase, type ModerationCase, type ReviewCase } from './moderationCases.js';
import { RECORDED_LABELS } from './moderationRecorded.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RuleStat {
  code: string;
  tp: number;
  fp: number;
  fn: number;
  /** null when the rule never fired. */
  precision: number | null;
  /** null when nothing was expected of it. */
  recall: number | null;
}

export interface Example {
  id: string;
  kind: string;
  text: string;
  /** Rule codes (or the label) involved. */
  codes: string[];
}

export interface RuleLayerResult {
  perRule: RuleStat[];
  /** Item level: flagged by any rule vs. should be flagged. */
  overall: { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null };
  falsePositives: Example[];
  misses: Example[];
  predicted: Record<string, string[]>;
  markdown: string;
}

const ratio = (num: number, den: number): number | null => (den ? num / den : null);
const fmt = (value: number | null): string => (value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`);
const excerpt = (text: string, length = 90): string => (text.length > length ? `${text.slice(0, length - 1)}…` : text).replace(/\s+/g, ' ').replace(/\|/g, '\\|');

const describe = (item: ModerationCase): string => {
  if (item.kind === 'review') return item.text;
  if (item.kind === 'listing') return `${item.title}: ${item.desc || '(no description)'} [${item.price} Tk]`;
  const people = new Set(item.messages.map((message) => message.to)).size;
  return `${item.messages.length} messages to ${people} ${people === 1 ? 'person' : 'people'}, e.g. "${item.messages[0]?.text ?? ''}"`;
};

const clearAll = async (): Promise<void> => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
};

const photoOf = (id: string): string => `data:image/png;base64,EVALPHOTO${id.replace(/[^a-z0-9]/gi, '')}`;

const seedBook = (fields: { title: string; author: string; price: number; desc?: string; seller: string; images: string[]; discountPercent?: number }) =>
  AddBook.create({
    title: fields.title,
    author: fields.author,
    price: fields.price,
    desc: fields.desc ?? '',
    category: ['Novel'],
    bookType: 'new',
    sellerEmail: fields.seller,
    images: fields.images,
    ...(fields.discountPercent ? { discountType: 'percent', discountValue: fields.discountPercent } : {}),
  });

const reviewerEmail = 'reviewer@eval.test';

const rulesForReview = async (item: ReviewCase): Promise<string[]> => {
  const subject = await seedBook({ title: 'Subject Book', author: 'An Author', price: 300, seller: 'seller@eval.test', images: [photoOf(`${item.id}s`)] });
  await User.create({ username: 'reviewer', email: reviewerEmail, password: 'not-a-real-hash', role: 'user' });
  await User.collection.updateOne({ email: reviewerEmail }, { $set: { createdAt: new Date(Date.now() - (item.accountAgeDays ?? 60) * DAY_MS) } });
  if (item.duplicateOf) {
    const other = await seedBook({ title: 'Another Book', author: 'Someone', price: 300, seller: 'seller@eval.test', images: [photoOf(`${item.id}o`)] });
    await Review.create({ book: other._id, reviewerEmail: 'someone@eval.test', reviewerName: 'Someone', rating: 5, title: '', body: item.text });
  }
  for (let index = 0; index < (item.burstOthers ?? 0); index += 1) {
    await Review.create({
      book: subject._id,
      reviewerEmail: `burst${index}@eval.test`,
      reviewerName: `Burst ${index}`,
      rating: 4,
      title: '',
      body: ['Plot kept me guessing', 'Lovely printing on thick paper', 'Arrived early, wrapped well', 'Translation reads naturally'][index % 4] + ` (reader ${index})`,
    });
  }
  const mine = await Review.create({ book: subject._id, reviewerEmail, reviewerName: 'Reviewer', rating: item.rating, title: '', body: item.text });
  const reasons = await reviewReasons({
    kind: 'review',
    id: mine._id,
    text: item.text,
    rating: item.rating,
    authorEmail: reviewerEmail,
    subjectId: subject._id,
    createdAt: new Date((mine as { createdAt?: Date }).createdAt ?? Date.now()),
  });
  return reasons.map((reason) => reason.code);
};

const rulesForListing = async (item: ListingCase): Promise<string[]> => {
  const seller = 'seller@eval.test';
  for (const [index, price] of (item.comparables ?? []).entries()) {
    await seedBook({ title: item.title, author: item.author, price, seller: `other${index}@eval.test`, images: [photoOf(`${item.id}c${index}`)] });
  }
  if (item.copiedPhoto) {
    const original = await seedBook({ title: 'Original', author: 'Someone', price: 300, seller: 'thief-victim@eval.test', images: [photoOf(`${item.id}copy`)] });
    // The first listing is scanned when it is posted, which is when its photo's fingerprint is recorded.
    await listingReasons((await AddBook.findById(original._id).lean<LeanBook>()) as LeanBook);
  }
  const doc = await seedBook({
    title: item.title,
    author: item.author,
    price: item.price,
    desc: item.desc,
    seller,
    images: item.noPhoto ? [] : [item.copiedPhoto ? photoOf(`${item.id}copy`) : photoOf(item.id)],
    ...(item.discountPercent ? { discountPercent: item.discountPercent } : {}),
  });
  const lean = (await AddBook.findById(doc._id).lean<LeanBook>()) as LeanBook;
  return (await listingReasons(lean)).map((reason) => reason.code);
};

const rulesForChat = async (item: ChatCase): Promise<string[]> => {
  const sender = 'sender@eval.test';
  const now = new Date();
  if (item.asked) {
    // The questions that came first, an hour before the replies.
    await ChatMessage.insertMany(
      [...new Set(item.messages.map((message) => message.to))].map((to) => ({
        sender: `person${to}@eval.test`,
        receiver: sender,
        message: 'Is this book still available?',
        timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 60 * 1000),
      }))
    );
  }
  await ChatMessage.insertMany(
    item.messages.map((message) => ({
      sender,
      receiver: `person${message.to}@eval.test`,
      message: message.text,
      timestamp: new Date(now.getTime() - message.minutesAgo * 60 * 1000),
    }))
  );
  return (await chatReasons(sender, now)).reasons.map((reason) => reason.code);
};

const predictRules = async (item: ModerationCase): Promise<string[]> => {
  await clearAll();
  const codes = item.kind === 'review' ? await rulesForReview(item) : item.kind === 'listing' ? await rulesForListing(item) : await rulesForChat(item);
  return [...new Set(codes)].sort();
};

/** Runs the rule layer over the cases, in the current database. */
export const runRuleLayer = async (cases: ModerationCase[] = MODERATION_CASES): Promise<RuleLayerResult> => {
  const predicted: Record<string, string[]> = {};
  for (const item of cases) predicted[item.id] = await predictRules(item);

  const codes = new Set<string>();
  for (const item of cases) {
    item.expect.forEach((code) => codes.add(code));
    predicted[item.id]?.forEach((code) => codes.add(code));
  }
  const perRule: RuleStat[] = [...codes].sort().map((code) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const item of cases) {
      const want = item.expect.includes(code);
      const got = predicted[item.id]?.includes(code) ?? false;
      if (want && got) tp += 1;
      else if (got) fp += 1;
      else if (want) fn += 1;
    }
    return { code, tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) };
  });

  const falsePositives: Example[] = [];
  const misses: Example[] = [];
  const overall = { tp: 0, fp: 0, fn: 0, tn: 0, precision: null as number | null, recall: null as number | null };
  for (const item of cases) {
    const got = predicted[item.id] ?? [];
    const extra = got.filter((code) => !item.expect.includes(code));
    const missing = item.expect.filter((code) => !got.includes(code));
    if (extra.length) falsePositives.push({ id: item.id, kind: item.kind, text: describe(item), codes: extra });
    if (missing.length) misses.push({ id: item.id, kind: item.kind, text: describe(item), codes: missing });
    const should = item.expect.length > 0;
    const did = got.length > 0;
    if (should && did) overall.tp += 1;
    else if (did) overall.fp += 1;
    else if (should) overall.fn += 1;
    else overall.tn += 1;
  }
  overall.precision = ratio(overall.tp, overall.tp + overall.fp);
  overall.recall = ratio(overall.tp, overall.tp + overall.fn);

  const lines = [
    `Moderation rule layer, ${cases.length} labelled items (${cases.filter((c) => c.kind === 'review').length} reviews, ${cases.filter((c) => c.kind === 'listing').length} listings, ${cases.filter((c) => c.kind === 'chat').length} chat patterns).`,
    '',
    '| Rule | TP | FP | FN | Precision | Recall |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...perRule.map((rule) => `| ${rule.code} | ${rule.tp} | ${rule.fp} | ${rule.fn} | ${fmt(rule.precision)} | ${fmt(rule.recall)} |`),
    '',
    `Item level (flagged by any rule vs. should be flagged): precision ${fmt(overall.precision)}, recall ${fmt(overall.recall)} (TP ${overall.tp}, FP ${overall.fp}, FN ${overall.fn}, TN ${overall.tn}).`,
  ];
  if (falsePositives.length) {
    lines.push('', 'False positives (a rule fired that should not have):', '');
    for (const example of falsePositives) lines.push(`- ${example.id} (${example.kind}) \`${example.codes.join(', ')}\`: ${excerpt(example.text)}`);
  }
  if (misses.length) {
    lines.push('', 'Misses (a rule that should have fired did not):', '');
    for (const example of misses) lines.push(`- ${example.id} (${example.kind}) \`${example.codes.join(', ')}\`: ${excerpt(example.text)}`);
  }
  return { perRule, overall, falsePositives, misses, predicted, markdown: lines.join('\n') };
};

// ------------------------------------------------------------- model layer

export interface LabelStat {
  label: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
}

export interface ModelLayerResult {
  mode: 'offline' | 'live';
  items: number;
  perLabel: LabelStat[];
  /** Flagged (any label but ok) vs. should be flagged. */
  flagged: { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null };
  accuracy: number;
  /** Calls that failed (busy, over budget, unreadable): counted as "ok", reported here. */
  errors: number;
  predicted: Record<string, ModerationLabel>;
  falsePositives: Example[];
  misses: Example[];
  /** Flagged, but with the wrong label. */
  mislabelled: Example[];
  markdown: string;
}

export interface RunModelLayerOptions {
  mode: 'offline' | 'live';
  paceMs?: number;
  cases?: ModerationCase[];
  onProgress?: (line: string) => void;
}

const publicText = (item: ReviewCase | ListingCase): { kind: 'review' | 'listing'; text: string; context: string } =>
  item.kind === 'review'
    ? { kind: 'review', text: item.text, context: 'Subject Book' }
    : { kind: 'listing', text: `${item.title}\nby ${item.author}\n${item.desc}`, context: 'Novel' };

export const runModelLayer = async (options: RunModelLayerOptions): Promise<ModelLayerResult> => {
  const { mode } = options;
  // Private text never goes to the model: chat is left out here, whatever the caller passed.
  const items = (options.cases ?? MODERATION_CASES).filter((item): item is ReviewCase | ListingCase => item.kind !== 'chat');
  const paceMs = options.paceMs ?? DEFAULT_PACE_MS;

  const saved = { key: process.env.GEMINI_API_KEY, rpm: process.env.GEMINI_RPM, rpd: process.env.GEMINI_RPD };
  if (mode === 'offline') process.env.GEMINI_API_KEY = 'offline-eval-not-a-real-key';
  // Moderation gets a share of these; large enough that only the transport (and the pacing) limits it.
  process.env.GEMINI_RPM = '100000';
  process.env.GEMINI_RPD = '10000000';

  const predicted: Record<string, ModerationLabel> = {};
  let errors = 0;
  let currentId = '';
  try {
    setGeminiTransportForTesting(
      mode === 'live'
        ? pacedLiveTransport(paceMs)
        : async (url) => {
            if (!url.includes(':generateContent')) return { status: 404, body: null };
            const recorded = RECORDED_LABELS[currentId];
            if (!recorded) return { status: 500, body: null };
            const [label, confidence, reason] = recorded;
            return { status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ label, confidence, reason }) }] }, finishReason: 'STOP' }] } };
          }
    );
    for (const item of items) {
      resetGeminiBudgetForTesting();
      currentId = item.id;
      const { kind, text, context } = publicText(item);
      let label: ModerationLabel = 'ok';
      try {
        const reasons = await modelReasons(kind, text, context);
        const code = reasons[0]?.code;
        const named = code?.startsWith('model:') ? code.slice('model:'.length) : 'ok';
        label = (MODERATION_LABELS as readonly string[]).includes(named) ? (named as ModerationLabel) : 'ok';
      } catch {
        errors += 1;
      }
      predicted[item.id] = label;
      options.onProgress?.(`${label === item.label ? 'ok  ' : 'MISS'} ${item.id}: truth ${item.label}, model ${label}`);
    }
  } finally {
    setGeminiTransportForTesting(null);
    const restore = (name: 'GEMINI_API_KEY' | 'GEMINI_RPM' | 'GEMINI_RPD', value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('GEMINI_API_KEY', saved.key);
    restore('GEMINI_RPM', saved.rpm);
    restore('GEMINI_RPD', saved.rpd);
  }

  const perLabel: LabelStat[] = MODERATION_LABELS.map((label) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const item of items) {
      const got = predicted[item.id];
      if (item.label === label && got === label) tp += 1;
      else if (got === label) fp += 1;
      else if (item.label === label) fn += 1;
    }
    return { label, tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) };
  });

  const flagged = { tp: 0, fp: 0, fn: 0, tn: 0, precision: null as number | null, recall: null as number | null };
  const falsePositives: Example[] = [];
  const misses: Example[] = [];
  const mislabelled: Example[] = [];
  let correct = 0;
  for (const item of items) {
    const got = predicted[item.id] ?? 'ok';
    const should = item.label !== 'ok';
    const did = got !== 'ok';
    if (got === item.label) correct += 1;
    if (should && did) {
      flagged.tp += 1;
      if (got !== item.label) mislabelled.push({ id: item.id, kind: item.kind, text: describe(item), codes: [`truth ${item.label}`, `model ${got}`] });
    } else if (did) {
      flagged.fp += 1;
      falsePositives.push({ id: item.id, kind: item.kind, text: describe(item), codes: [`model ${got}`] });
    } else if (should) {
      flagged.fn += 1;
      misses.push({ id: item.id, kind: item.kind, text: describe(item), codes: [`truth ${item.label}`] });
    } else flagged.tn += 1;
  }
  flagged.precision = ratio(flagged.tp, flagged.tp + flagged.fp);
  flagged.recall = ratio(flagged.tp, flagged.tp + flagged.fn);

  const lines = [
    `Moderation model layer, ${mode} mode, ${items.length} public-text items (reviews and listings; chat is never sent).`,
    '',
    '| Label | TP | FP | FN | Precision | Recall |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...perLabel.map((row) => `| ${row.label} | ${row.tp} | ${row.fp} | ${row.fn} | ${fmt(row.precision)} | ${fmt(row.recall)} |`),
    '',
    `Flagged vs. ok: precision ${fmt(flagged.precision)}, recall ${fmt(flagged.recall)}; label accuracy ${(100 * correct / Math.max(1, items.length)).toFixed(0)}%; ${errors} call(s) failed.`,
  ];
  if (falsePositives.length) {
    lines.push('', 'False positives (model flagged an ok item):', '');
    for (const example of falsePositives) lines.push(`- ${example.id} (${example.kind}) \`${example.codes.join(', ')}\`: ${excerpt(example.text)}`);
  }
  if (misses.length) {
    lines.push('', 'Misses (model said ok to an item that should be flagged):', '');
    for (const example of misses) lines.push(`- ${example.id} (${example.kind}) \`${example.codes.join(', ')}\`: ${excerpt(example.text)}`);
  }
  if (mislabelled.length) {
    lines.push('', 'Flagged with the wrong label:', '');
    for (const example of mislabelled) lines.push(`- ${example.id} (${example.kind}) \`${example.codes.join(', ')}\`: ${excerpt(example.text)}`);
  }
  return {
    mode,
    items: items.length,
    perLabel,
    flagged,
    accuracy: correct / Math.max(1, items.length),
    errors,
    predicted,
    falsePositives,
    misses,
    mislabelled,
    markdown: lines.join('\n'),
  };
};
