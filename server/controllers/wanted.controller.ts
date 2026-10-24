import type { RequestHandler } from 'express';

import type { CreateWantedResponse, WantedItem } from '@shared/api.js';

import WantedBook, { type WantedBookAttributes } from '../models/WantedBook.model.js';
import AddBook from '../models/AddBook.model.js';
import { actingUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';
import { recordAudit } from '../utils/audit.js';
import { contains } from '../utils/regex.js';
import { isSameBook, keyOf, listedAlready, normaliseIsbn } from '../utils/wanted.js';
import type { CreateWantedBody, WantedListQuery } from '../schemas/index.js';
import { bnDigits, t } from '../utils/language.js';

/** Open requests one person may have at a time: plenty to ask, too few to flood the board. */
export const MAX_OPEN_PER_PERSON = 20;

type Stored = WantedBookAttributes & { _id: unknown; createdAt?: Date };

const toItem = (entry: Stored, email: string | undefined, found?: { _id: unknown; title: string } | null): WantedItem => ({
  _id: String(entry._id),
  title: entry.title,
  author: entry.author ?? '',
  isbn: entry.isbn ?? '',
  details: entry.details ?? '',
  count: entry.requesterCount ?? entry.requesters.length,
  wantedByMe: Boolean(email) && entry.requesters.some((r) => r.email === email),
  status: entry.status as WantedItem['status'],
  foundBook: found ? { _id: String(found._id), title: found.title } : null,
  createdAt: (entry.createdAt ?? new Date()).toISOString(),
  foundAt: entry.foundAt ? new Date(entry.foundAt).toISOString() : null,
});

/** A page of the board: open or found, most wanted or newest first, searchable. */
export const listWanted: RequestHandler = async (req, res, next) => {
  try {
    const query = validatedQuery<WantedListQuery>(req);
    const email = req.user?.email;
    // Narrowed where the query is built (String, and patterns rather than
    // strings), so no request value can arrive as an operator - see
    // docs/ROADMAP.md on js/sql-injection.
    const filter: Record<string, unknown> = { status: query.status === 'found' ? 'found' : 'open' };
    if (query.mine && email) filter['requesters.email'] = String(email);
    if (query.search) {
      const pattern = contains(String(query.search));
      const key = keyOf(String(query.search));
      filter.$or = [{ title: pattern }, { author: pattern }, { isbn: pattern }, ...(key.length >= 3 ? [{ titleKey: contains(key) }] : [])];
    }
    const sort: Record<string, 1 | -1> =
      query.sort === 'newest' ? { createdAt: -1, _id: -1 } : { requesterCount: -1, createdAt: -1, _id: -1 };

    const [entries, total] = await Promise.all([
      WantedBook.find(filter).sort(sort).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
      WantedBook.countDocuments(filter),
    ]);
    const books = await AddBook.find({ _id: { $in: entries.map((e) => e.foundBook).filter(Boolean) } }, { title: 1 }).lean();
    const titles = new Map(books.map((book) => [String(book._id), book]));

    res.status(200).json({
      items: entries.map((entry) => toItem(entry, email, entry.foundBook ? titles.get(String(entry.foundBook)) ?? null : null)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  } catch (error) {
    next(error);
  }
};

/** Why someone cannot ask for one more book, or null when they can. */
const overLimit = async (req: Parameters<typeof t>[0], email: string): Promise<string | null> =>
  (await WantedBook.countDocuments({ status: 'open', 'requesters.email': email })) >= MAX_OPEN_PER_PERSON
    ? t(
        req,
        `You can ask for up to ${MAX_OPEN_PER_PERSON} books at a time. Remove one you no longer need first.`,
        `একসঙ্গে সর্বোচ্চ ${bnDigits(MAX_OPEN_PER_PERSON)}টি বই চাইতে পারেন। আগে যেটি আর দরকার নেই, সেটি সরান।`
      )
    : null;

/**
 * Puts a reader on an open request, once: one step that both checks they are
 * not on it yet and adds them, so two taps at once count once and the count
 * always matches the list. Their "Anything else?" goes with them, and onto
 * the request itself if it had none.
 */
const joinEntry = async (id: unknown, email: string, details = ''): Promise<boolean> => {
  const joined = await WantedBook.updateOne(
    { _id: id, status: 'open', 'requesters.email': { $ne: email } },
    { $push: { requesters: { email, at: new Date(), details } }, $inc: { requesterCount: 1 } }
  );
  if (details) await WantedBook.updateOne({ _id: id, details: { $in: ['', null] } }, { $set: { details } });
  return joined.modifiedCount === 1;
};

/**
 * Asks for a book. If it is in the shop already, says so instead; if someone
 * has asked for it already, joins their request, so each book is on the board
 * once and everyone who wants it hears together.
 */
export const createWanted: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { title, author = '', isbn = '', details = '' } = req.body as CreateWantedBody;
    const request = { title, author, isbn: normaliseIsbn(isbn), titleKey: keyOf(title), authorKey: keyOf(author) };

    if (request.titleKey.length < 2) {
      res.status(400).json({ message: t(req, 'Give the title as it is printed on the book', 'বইয়ে যেভাবে ছাপা আছে, সেভাবে শিরোনাম লিখুন') });
      return;
    }

    const listed = await listedAlready({ title, author, isbn });
    if (listed) {
      const body: CreateWantedResponse = {
        result: 'listed',
        message: t(req, 'Good news: this book is in the shop already.', 'সুখবর: বইটি শপে আগে থেকেই আছে।'),
        book: { _id: String(listed._id), title: listed.title },
      };
      res.status(200).json(body);
      return;
    }

    const candidates = await WantedBook.find({
      status: 'open',
      $or: [...(request.isbn ? [{ isbn: request.isbn }] : []), { titleKey: request.titleKey }],
    });
    const existing = candidates.find((entry) => isSameBook(entry, { isbn: request.isbn, title, author }));

    if (existing) {
      if (!existing.requesters.some((r) => r.email === actor.email)) {
        // Joining counts towards the limit as asking does.
        const limit = await overLimit(req, actor.email);
        if (limit) {
          res.status(429).json({ message: limit });
          return;
        }
        await joinEntry(existing._id, actor.email, details);
        // A detail the first person left out is still worth having.
        const filled: Record<string, string> = {};
        if (!existing.author && author) Object.assign(filled, { author, authorKey: request.authorKey });
        if (!existing.isbn && request.isbn) filled.isbn = request.isbn;
        if (Object.keys(filled).length) await WantedBook.updateOne({ _id: existing._id }, { $set: filled });
      }
      const fresh = (await WantedBook.findById(existing._id).lean()) ?? existing.toObject();
      const others = Number(fresh.requesterCount) - 1;
      const body: CreateWantedResponse = {
        result: 'joined',
        message:
          others > 0
            ? t(
                req,
                `${others} ${others === 1 ? 'other reader has' : 'other readers have'} asked for this too. You are on the list, and everyone hears the moment it is listed.`,
                `আরও ${bnDigits(others)} জন পাঠক বইটি চেয়েছেন। আপনিও তালিকায় আছেন; বইটি তালিকায় আসামাত্র সবাইকে জানানো হবে।`
              )
            : t(
                req,
                'You have asked for this already. You will hear the moment it is listed.',
                'আপনি বইটি আগেই চেয়েছেন। তালিকায় আসামাত্র আপনাকে জানানো হবে।'
              ),
        item: toItem(fresh, actor.email),
      };
      res.status(200).json(body);
      return;
    }

    const limit = await overLimit(req, actor.email);
    if (limit) {
      res.status(429).json({ message: limit });
      return;
    }

    const entry = await WantedBook.create({
      ...request,
      details,
      requesters: [{ email: actor.email, at: new Date(), details }],
      requesterCount: 1,
      createdBy: actor.email,
    });
    const body: CreateWantedResponse = {
      result: 'created',
      message: t(
        req,
        'It is on the Wanted board. We will tell you the moment someone lists it.',
        'বইটি চাহিদার বোর্ডে উঠেছে। কেউ তালিকায় দেওয়ামাত্র আপনাকে জানাব।'
      ),
      item: toItem(entry.toObject(), actor.email),
    };
    res.status(201).json(body);
  } catch (error) {
    next(error);
  }
};

/** "I want this too." */
export const joinWanted: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const entry = await WantedBook.findOne({ _id: String(req.params.id), status: 'open' });
    if (!entry) {
      res.status(404).json({ message: t(req, 'That request is no longer open', 'এই অনুরোধটি আর খোলা নেই') });
      return;
    }
    if (!entry.requesters.some((r) => r.email === actor.email)) {
      const limit = await overLimit(req, actor.email);
      if (limit) {
        res.status(429).json({ message: limit });
        return;
      }
      await joinEntry(entry._id, actor.email);
    }
    const fresh = (await WantedBook.findById(entry._id).lean()) ?? entry.toObject();
    res.status(200).json(toItem(fresh, actor.email));
  } catch (error) {
    next(error);
  }
};

/** No longer wanted. The last person to leave takes the entry with them. */
export const leaveWanted: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const entry = await WantedBook.findById(String(req.params.id));
    if (!entry) {
      res.status(404).json({ message: t(req, 'Request not found', 'অনুরোধটি পাওয়া যায়নি') });
      return;
    }
    entry.set('requesters', entry.requesters.filter((r) => r.email !== actor.email));
    entry.requesterCount = entry.requesters.length;
    if (entry.requesterCount === 0 && entry.status === 'open') {
      await entry.deleteOne();
      res.status(200).json({ message: t(req, 'Removed from the Wanted board', 'চাহিদার বোর্ড থেকে সরানো হয়েছে') });
      return;
    }
    await entry.save();
    res.status(200).json({
      message: t(req, 'You are off the list for this book', 'এই বইয়ের তালিকা থেকে আপনাকে সরানো হয়েছে'),
      item: toItem(entry.toObject(), actor.email),
    });
  } catch (error) {
    next(error);
  }
};

/** An administrator removing a request that breaks the rules. */
export const removeWanted: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const entry = await WantedBook.findByIdAndDelete(String(req.params.id));
    if (!entry) {
      res.status(404).json({ message: t(req, 'Request not found', 'অনুরোধটি পাওয়া যায়নি') });
      return;
    }
    await recordAudit(req, {
      action: 'wanted.delete',
      targetType: 'wanted',
      targetId: String(entry._id),
      details: { title: entry.title, requesters: entry.requesterCount },
    });
    res.status(200).json({ message: t(req, 'Request removed', 'অনুরোধটি সরানো হয়েছে') });
  } catch (error) {
    next(error);
  }
};
