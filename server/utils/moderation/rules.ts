import { createHash } from 'crypto';

import type { Types } from 'mongoose';

import AddBook, { type LeanBook } from '../../models/AddBook.model.js';
import ChatMessage from '../../models/Chat.model.js';
import ImageHash from '../../models/ImageHash.model.js';
import Review from '../../models/Review.model.js';
import SellerReview from '../../models/SellerReview.model.js';
import User from '../../models/user.model.js';
import {
  ABUSIVE_TERMS,
  BANNED_ITEMS,
  MODERATION_THRESHOLDS as LIMITS,
  OFF_SITE_PHRASES,
  PERSON_REFERENCES,
  PROMOTION_PHRASES,
} from '../../config/moderationPolicy.js';
import { fetchPerceptualHash, publicIdFromUrl } from '../../config/cloudinary.js';
import { escapeRegex } from '../regex.js';
import { findContactDetails, toAsciiDigits } from '../contactDetails.js';
import { normaliseIsbn, keyOf } from '../wanted.js';
import { hammingDistance, hasPhrase, median, normalise, phrasesIn, shingles, similarity, textHash } from './text.js';

/**
 * The deterministic checks: free, fast, and explainable. Each returns zero or
 * more reasons, every one with a code (a rule an owner can switch off), a
 * score from 0 to 1, and a sentence saying why in plain words.
 *
 * A reason is a suggestion for an administrator, never proof: a "fraud" in a
 * review is often an honest complaint, which is why such words only count in
 * numbers.
 */

export interface Reason {
  code: string;
  source: 'rule' | 'model';
  score: number;
  detail: string;
}

const reason = (code: string, score: number, detail: string): Reason => ({ code, source: 'rule', score, detail });

const DAY_MS = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------------ words

/** Abusive words: a severe one on its own, mild ones only in numbers. Names the kinds, never repeats the words. */
export const abuseReasons = (text: string): Reason[] => {
  const haystack = normalise(text);
  const hits = ABUSIVE_TERMS.filter((entry) => haystack.includes(normalise(entry.term)));
  const severe = hits.filter((entry) => entry.severity === 'severe');
  const reasons: Reason[] = [];
  if (severe.length) {
    const kinds = [...new Set(severe.map((entry) => entry.kind))];
    const threat = kinds.includes('threat');
    reasons.push(reason(threat ? 'threat' : 'abuse', threat ? 0.95 : 0.85, `Contains ${kinds.join(', ')} language (${severe.length} term${severe.length > 1 ? 's' : ''}).`));
  }
  const mild = hits.filter((entry) => entry.severity === 'mild');
  // Harsh words about a parcel or a plot are a complaint or a figure of
  // speech; they count only when the text also points at a person.
  const aimed = PERSON_REFERENCES.some((word) => hasPhrase(haystack, word));
  if (!severe.length && aimed && mild.length >= LIMITS.mildWordsToFlag) {
    reasons.push(reason('abuse-mild', 0.45, `Several harsh words (${mild.length}) aimed at a person, possibly a personal attack.`));
  }
  return reasons;
};

/** Phone numbers, e-mail addresses, links, and "message me on WhatsApp". */
export const contactReasons = (text: string): Reason[] => {
  const found = findContactDetails(text);
  const kinds = [
    found.phones.length ? 'a phone or bKash number' : '',
    found.emails.length ? 'an e-mail address' : '',
    found.links.length ? 'a link' : '',
  ].filter(Boolean);
  const reasons: Reason[] = [];
  if (kinds.length) reasons.push(reason('contact-details', 0.6, `Contains ${kinds.join(' and ')}.`));
  const offSite = phrasesIn(text, OFF_SITE_PHRASES);
  if (offSite.length) reasons.push(reason('off-site', 0.6, 'Asks people to deal outside the site.'));
  const promo = phrasesIn(text, PROMOTION_PHRASES);
  if (promo.length) reasons.push(reason('promotion', 0.5, 'Reads like an advertisement.'));
  return reasons;
};

// ---------------------------------------------------------------- reviews

export interface ReviewInput {
  kind: 'review' | 'seller-review';
  id: Types.ObjectId;
  text: string;
  rating: number;
  authorEmail: string;
  /** The book or the seller reviewed. */
  subjectId: Types.ObjectId;
  createdAt: Date;
}

export const reviewReasons = async (input: ReviewInput): Promise<Reason[]> => {
  const reasons = [...abuseReasons(input.text), ...contactReasons(input.text)];

  // The same words in other reviews, here or on the other kind.
  if (input.text.trim().length >= LIMITS.duplicateMinChars) {
    const mine = shingles(input.text);
    const hash = textHash(input.text);
    const others = [
      ...(await Review.find({ _id: { $ne: input.id } }, { title: 1, body: 1, reviewerEmail: 1 }).sort({ createdAt: -1 }).limit(300).lean()),
      ...(await SellerReview.find({ _id: { $ne: input.id } }, { title: 1, body: 1, reviewerEmail: 1 }).sort({ createdAt: -1 }).limit(300).lean()),
    ];
    let copies = 0;
    let accounts = new Set<string>();
    for (const other of others) {
      const text = `${other.title ?? ''} ${other.body ?? ''}`;
      if (textHash(text) === hash || similarity(mine, shingles(text)) >= LIMITS.nearDuplicateSimilarity) {
        copies += 1;
        accounts.add(String(other.reviewerEmail));
      }
    }
    accounts = new Set([...accounts].filter((email) => email !== input.authorEmail));
    // Two buyers can honestly write the same short praise. Copies count when
    // several accounts share them, when one person pastes the same text
    // again and again, or when the copied text also advertises or carries
    // contact details.
    const selling = reasons.some((item) => ['contact-details', 'off-site', 'promotion'].includes(item.code));
    const ownCopies = copies - [...accounts].length;
    if (accounts.size >= LIMITS.duplicateAccounts || ownCopies >= 2 || (copies && selling)) {
      reasons.push(
        reason(
          'duplicate-text',
          accounts.size ? 0.7 : 0.5,
          `The same or nearly the same text appears in ${copies} other review${copies > 1 ? 's' : ''}${accounts.size ? `, from ${accounts.size} other account${accounts.size > 1 ? 's' : ''}` : ''}.`
        )
      );
    }
  }

  // A burst: many reviews on one book or seller in a short time.
  const since = new Date(input.createdAt.getTime() - LIMITS.reviewBurstWindowMinutes * 60 * 1000);
  const burst =
    input.kind === 'review'
      ? await Review.countDocuments({ book: input.subjectId, createdAt: { $gte: since } })
      : await SellerReview.countDocuments({ seller: input.subjectId, createdAt: { $gte: since } });
  if (burst >= LIMITS.reviewBurstCount) {
    reasons.push(reason('review-burst', 0.4, `${burst} reviews arrived within ${LIMITS.reviewBurstWindowMinutes} minutes.`));
  }

  // A brand-new account leaving a one-line extreme rating.
  if ((input.rating === 1 || input.rating === 5) && input.text.trim().length < LIMITS.shortReviewChars) {
    const author = (await User.findOne({ email: input.authorEmail }).select('createdAt').lean()) as { createdAt?: Date } | null;
    if (author?.createdAt && input.createdAt.getTime() - new Date(author.createdAt).getTime() < LIMITS.newAccountDays * DAY_MS) {
      reasons.push(reason('new-account-extreme', 0.35, `A ${input.rating}-star rating with almost no text from an account under ${LIMITS.newAccountDays} days old.`));
    }
  }
  return reasons;
};

// --------------------------------------------------------------- listings

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Records a listing's photo fingerprints and says which other listings share one. */
const photoReasons = async (book: LeanBook): Promise<Reason[]> => {
  const mine: { kind: 'phash' | 'sha256'; hash: string }[] = [];
  for (const image of (book.images ?? []).slice(0, 5)) {
    if (typeof image !== 'string') continue;
    if (image.startsWith('data:')) {
      mine.push({ kind: 'sha256', hash: sha256(image) });
      continue;
    }
    const publicId = publicIdFromUrl(image);
    const phash = publicId ? await fetchPerceptualHash(publicId) : null;
    if (phash) mine.push({ kind: 'phash', hash: phash });
  }
  if (!mine.length) return [];

  await Promise.all(
    mine.map((entry) =>
      ImageHash.updateOne(
        { listing: book._id, hash: entry.hash },
        { $setOnInsert: { listing: book._id, sellerEmail: book.sellerEmail, kind: entry.kind, hash: entry.hash } },
        { upsert: true }
      )
    )
  );

  const exact = await ImageHash.find({ listing: { $ne: book._id }, hash: { $in: mine.map((entry) => entry.hash) } }, { listing: 1, sellerEmail: 1 }).lean();
  const near = mine.some((entry) => entry.kind === 'phash')
    ? (await ImageHash.find({ listing: { $ne: book._id }, kind: 'phash' }, { listing: 1, sellerEmail: 1, hash: 1 }).limit(5000).lean()).filter((other) =>
        mine.some((entry) => entry.kind === 'phash' && hammingDistance(entry.hash, other.hash) <= LIMITS.photoHashDistance)
      )
    : [];
  const matches = [...exact, ...near];
  // Only listings that still exist.
  const live = new Set((await AddBook.find({ _id: { $in: matches.map((match) => match.listing) } }, { _id: 1 }).lean()).map((row) => String(row._id)));
  const others = matches.filter((match) => live.has(String(match.listing)));
  if (!others.length) return [];
  const otherSellers = new Set(others.filter((match) => match.sellerEmail !== book.sellerEmail).map((match) => match.sellerEmail));
  const listings = new Set(others.map((match) => String(match.listing))).size;
  return [
    otherSellers.size
      ? reason('duplicate-photo', 0.6, `A photo matches ${listings} listing${listings > 1 ? 's' : ''} by ${otherSellers.size} other seller${otherSellers.size > 1 ? 's' : ''}: possibly a copied photo.`)
      : reason('duplicate-photo-same-seller', 0.25, `A photo matches ${listings} other listing${listings > 1 ? 's' : ''} by the same seller.`),
  ];
};

/** A price far from what similar listings ask, a placeholder price, or a discount the text claims but the price does not show. */
const priceReasons = async (book: LeanBook): Promise<Reason[]> => {
  const price = Number(book.salePrice ?? book.price);
  const reasons: Reason[] = [];
  if (price <= LIMITS.placeholderPrice) {
    reasons.push(reason('placeholder-price', 0.55, `Priced at ${price} Tk, which looks like a placeholder.`));
  }

  const isbn = normaliseIsbn(book.isbn);
  const titleKey = keyOf(book.title);
  const others = { _id: { $ne: book._id }, salePrice: { $gt: LIMITS.placeholderPrice } };
  const sameBook = await AddBook.find(
    {
      ...others,
      bookType: book.bookType,
      $or: [...(isbn ? [{ isbn: new RegExp(escapeRegex(isbn.slice(-10))) }] : []), { title: new RegExp(`^${escapeRegex(book.title.trim())}$`, 'i') }],
    },
    { salePrice: 1, title: 1, author: 1, isbn: 1 }
  )
    .limit(100)
    .lean();
  let comparables = sameBook
    .filter((other) => (isbn && normaliseIsbn(other.isbn) === isbn) || (keyOf(other.title) === titleKey && keyOf(other.author) === keyOf(book.author)))
    .map((other) => Number(other.salePrice));
  let basis = 'the same book';
  if (comparables.length < LIMITS.priceComparables && book.category?.length) {
    comparables = (
      await AddBook.find({ ...others, bookType: book.bookType, category: { $in: book.category }, ...(book.condition ? { condition: book.condition } : {}) }, { salePrice: 1 })
        .limit(200)
        .lean()
    ).map((other) => Number(other.salePrice));
    basis = 'similar books in the same category';
  }
  const typical = comparables.length >= LIMITS.priceComparables ? median(comparables) : null;
  if (typical && price > LIMITS.placeholderPrice) {
    if (price < typical * LIMITS.priceLowShare) {
      reasons.push(reason('price-outlier', 0.5, `${price} Tk is far below ${basis} (typically ${Math.round(typical)} Tk).`));
    } else if (price > typical * LIMITS.priceHighMultiple) {
      reasons.push(reason('price-outlier', 0.45, `${price} Tk is far above ${basis} (typically ${Math.round(typical)} Tk).`));
    }
  }

  // "50% off" in the text, with no such discount on the listing.
  const words = `${book.title} ${book.desc ?? ''}`;
  const claim = /(\d{1,2})\s*%/.exec(toAsciiDigits(words))?.[1];
  if (claim && /off|discount|ছাড়|ছাড়|chhar/i.test(words) && Math.abs(Number(claim) - Number(book.discountPercent ?? 0)) >= 5) {
    reasons.push(reason('discount-claim', 0.4, `The text claims ${claim}% off, but the listing shows ${Math.round(Number(book.discountPercent ?? 0))}%.`));
  }
  return reasons;
};

/** Items the shop does not allow, by the owner's list. */
export const bannedItemReasons = (text: string): Reason[] =>
  BANNED_ITEMS.flatMap((rule) => {
    const found = phrasesIn(text, rule.phrases);
    return found.length
      ? [reason(`banned:${rule.id}`, rule.severity === 'severe' ? 0.8 : 0.45, `Mentions ${rule.label.en.toLowerCase()} (${found.length} phrase${found.length > 1 ? 's' : ''}).`)]
      : [];
  });

export const listingReasons = async (book: LeanBook): Promise<Reason[]> => {
  const text = `${book.title}\n${book.author}\n${book.desc ?? ''}\n${book.conditionDetails ?? ''}`;
  const reasons = [
    ...bannedItemReasons(text),
    ...abuseReasons(text),
    ...contactReasons(`${book.desc ?? ''} ${book.conditionDetails ?? ''} ${book.title}`),
    ...(await priceReasons(book)),
    ...(await photoReasons(book)),
  ];
  if (!(book.desc ?? '').trim() && !(book.images ?? []).length) {
    reasons.push(reason('missing-details', 0.2, 'No description and no photo.'));
  }
  return reasons;
};

// ------------------------------------------------------------------- chat

export interface ChatFinding {
  reasons: Reason[];
  messageIds: Types.ObjectId[];
  messageCount: number;
}

/**
 * Spam patterns in one sender's recent messages. Rules only: chat is private,
 * and no message ever goes to the model.
 */
export const chatReasons = async (senderEmail: string, now: Date = new Date()): Promise<ChatFinding> => {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const recent = await ChatMessage.find({ sender: senderEmail, timestamp: { $gte: dayAgo } }, { receiver: 1, message: 1, timestamp: 1 })
    .sort({ timestamp: -1 })
    .limit(500)
    .lean();
  const reasons: Reason[] = [];
  const evidence = new Set<string>();

  const tenMinutesAgo = now.getTime() - 10 * 60 * 1000;
  const burst = recent.filter((message) => new Date(message.timestamp).getTime() >= tenMinutesAgo);
  // Many quick messages to one person is a conversation; to several, a blast.
  if (burst.length >= LIMITS.chatBurstCount && new Set(burst.map((message) => String(message.receiver))).size >= LIMITS.chatBurstRecipients) {
    reasons.push(reason('chat-burst', 0.45, `${burst.length} messages in ten minutes.`));
    burst.slice(0, 10).forEach((message) => evidence.add(String(message._id)));
  }

  // The same text to many people.
  const byText = new Map<string, { receivers: Set<string>; ids: string[] }>();
  for (const message of recent) {
    const text = String(message.message ?? '');
    if (normalise(text).trim().length < 10) continue;
    const key = textHash(text);
    const entry = byText.get(key) ?? { receivers: new Set(), ids: [] };
    entry.receivers.add(String(message.receiver));
    entry.ids.push(String(message._id));
    byText.set(key, entry);
  }
  const broadcast = [...byText.values()].sort((a, b) => b.receivers.size - a.receivers.size)[0];
  if (broadcast && broadcast.receivers.size >= LIMITS.chatBroadcastRecipients) {
    reasons.push(reason('chat-broadcast', 0.75, `The same message went to ${broadcast.receivers.size} different people today.`));
    broadcast.ids.slice(0, 10).forEach((id) => evidence.add(id));
  }

  // Contact details or links, repeated to several people.
  const withContact = recent.filter((message) => {
    const found = findContactDetails(String(message.message ?? ''));
    return found.phones.length || found.links.length || found.emails.length;
  });
  const contactReceivers = new Set(withContact.map((message) => String(message.receiver)));
  if (contactReceivers.size >= 3) {
    reasons.push(reason('chat-contact-spam', 0.55, `Phone numbers, addresses or links sent to ${contactReceivers.size} people today.`));
    withContact.slice(0, 10).forEach((message) => evidence.add(String(message._id)));
  }

  // Writing to many people first is how spam looks; answering many people
  // who asked is a busy seller.
  const receivers = new Set(recent.map((message) => String(message.receiver)));
  if (receivers.size >= LIMITS.chatManyRecipients) {
    const askedFirst = new Set(
      (await ChatMessage.distinct('sender', { receiver: senderEmail, sender: { $in: [...receivers] } })).map(String)
    );
    const unasked = [...receivers].filter((person) => !askedFirst.has(person)).length;
    if (unasked >= LIMITS.chatManyRecipients) {
      reasons.push(reason('chat-many-recipients', 0.4, `Wrote first to ${unasked} different people today.`));
    }
  }

  return {
    reasons,
    messageIds: [...evidence].slice(0, 20).map((id) => recent.find((message) => String(message._id) === id)?._id).filter((id): id is Types.ObjectId => Boolean(id)),
    messageCount: recent.length,
  };
};
