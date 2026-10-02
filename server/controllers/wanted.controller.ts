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
      res.status(400).json({ message: 'Give the title as it is printed on the book' });
      return;
    }

    const listed = await listedAlready({ title, author, isbn });
    if (listed) {
      const body: CreateWantedResponse = {
        result: 'listed',
        message: 'Good news: this book is in the shop already.',
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
        existing.requesters.push({ email: actor.email, at: new Date() });
        existing.requesterCount = existing.requesters.length;
        // A detail the first person left out is still worth having.
        if (!existing.author && author) {
          existing.author = author;
          existing.authorKey = request.authorKey;
        }
        if (!existing.isbn && request.isbn) existing.isbn = request.isbn;
        await existing.save();
      }
      const others = existing.requesterCount - 1;
      const body: CreateWantedResponse = {
        result: 'joined',
        message:
          others > 0
            ? `${others} ${others === 1 ? 'other reader has' : 'other readers have'} asked for this too. You are on the list, and everyone hears the moment it is listed.`
            : 'You have asked for this already. You will hear the moment it is listed.',
        item: toItem(existing.toObject(), actor.email),
      };
      res.status(200).json(body);
      return;
    }

    const open = await WantedBook.countDocuments({ status: 'open', 'requesters.email': actor.email });
    if (open >= MAX_OPEN_PER_PERSON) {
      res.status(429).json({ message: `You can ask for up to ${MAX_OPEN_PER_PERSON} books at a time. Remove one you no longer need first.` });
      return;
    }

    const entry = await WantedBook.create({
      ...request,
      details,
      requesters: [{ email: actor.email, at: new Date() }],
      requesterCount: 1,
      createdBy: actor.email,
    });
    const body: CreateWantedResponse = {
      result: 'created',
      message: 'It is on the Wanted board. We will tell you the moment someone lists it.',
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
      res.status(404).json({ message: 'That request is no longer open' });
      return;
    }
    if (!entry.requesters.some((r) => r.email === actor.email)) {
      const open = await WantedBook.countDocuments({ status: 'open', 'requesters.email': actor.email });
      if (open >= MAX_OPEN_PER_PERSON) {
        res.status(429).json({ message: `You can ask for up to ${MAX_OPEN_PER_PERSON} books at a time.` });
        return;
      }
      entry.requesters.push({ email: actor.email, at: new Date() });
      entry.requesterCount = entry.requesters.length;
      await entry.save();
    }
    res.status(200).json(toItem(entry.toObject(), actor.email));
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
      res.status(404).json({ message: 'Request not found' });
      return;
    }
    entry.set('requesters', entry.requesters.filter((r) => r.email !== actor.email));
    entry.requesterCount = entry.requesters.length;
    if (entry.requesterCount === 0 && entry.status === 'open') {
      await entry.deleteOne();
      res.status(200).json({ message: 'Removed from the Wanted board' });
      return;
    }
    await entry.save();
    res.status(200).json({ message: 'You are off the list for this book', item: toItem(entry.toObject(), actor.email) });
  } catch (error) {
    next(error);
  }
};

/** An administrator removing a request that breaks the rules. */
export const removeWanted: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const entry = await WantedBook.findByIdAndDelete(String(req.params.id));
    if (!entry) {
      res.status(404).json({ message: 'Request not found' });
      return;
    }
    await recordAudit(req, {
      action: 'wanted.delete',
      targetType: 'wanted',
      targetId: String(entry._id),
      details: { title: entry.title, requesters: entry.requesterCount },
    });
    res.status(200).json({ message: 'Request removed' });
  } catch (error) {
    next(error);
  }
};
