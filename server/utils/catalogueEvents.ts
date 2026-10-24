import type { Types } from 'mongoose';

import BookRequest from '../models/BookRequest.model.js';
import Cart from '../models/Cart.model.js';
import User from '../models/user.model.js';
import Wishlist from '../models/Wishlist.model.js';
import { notify } from './notify.js';
import { bnDigits } from './language.js';

/**
 * What happens when a book's stock or price moves: who is told.
 *
 * Every place that changes either goes through here - a seller editing it,
 * an order taking copies, a cancellation putting them back - so the rules
 * live in one place and nobody is told twice.
 */

/** "Running low" starts here: five copies or fewer. */
export const LOW_STOCK = 5;

interface BookRef {
  _id: Types.ObjectId | string;
  title?: string | null;
  sellerEmail?: string | null;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * Who has this book in their cart or on their wishlist, and since what price.
 * One entry per person: someone with it in both is told once, about the cart.
 */
const interestedIn = async (
  bookId: Types.ObjectId | string
): Promise<{ email: string; where: 'cart' | 'wishlist'; priceWhenAdded: number | null }[]> => {
  const [carts, saves] = await Promise.all([
    Cart.find({ book: bookId }, { user: 1, priceWhenAdded: 1 }).lean(),
    Wishlist.find({ book: bookId }, { user: 1, priceWhenAdded: 1 }).lean(),
  ]);
  const byUser = new Map<string, { where: 'cart' | 'wishlist'; priceWhenAdded: number | null }>();
  for (const save of saves) byUser.set(String(save.user), { where: 'wishlist', priceWhenAdded: save.priceWhenAdded ?? null });
  for (const cart of carts) byUser.set(String(cart.user), { where: 'cart', priceWhenAdded: cart.priceWhenAdded ?? null });
  if (!byUser.size) return [];

  const people = await User.find({ _id: { $in: [...byUser.keys()] } }, { email: 1 }).lean();
  return people.flatMap((person) => {
    const entry = byUser.get(String(person._id));
    return entry ? [{ email: person.email, ...entry }] : [];
  });
};

/**
 * A book's stock went from `before` to `after`.
 *
 * - Down to five or fewer, from more: the seller, and everyone with it in a
 *   cart or on a wishlist, hear it is running low.
 * - Down to none: the seller hears it has sold out.
 * - Back from none: everyone who asked for it hears it is back, and their
 *   requests are closed.
 *
 * Never throws: being told is a courtesy on top of the change itself.
 */
export const stockChanged = async (
  book: BookRef,
  before: number,
  after: number,
  { actor }: { actor?: string | null } = {}
): Promise<void> => {
  const title = book.title || 'A book';
  const titleBn = book.title || 'একটি বই';
  const link = `/book/${String(book._id)}`;
  try {
    if (before > LOW_STOCK && after <= LOW_STOCK && after > 0) {
      await notify([book.sellerEmail], {
        type: 'stock',
        title: { en: `Only ${after} left of "${title}"`, bn: `"${titleBn}" মাত্র ${bnDigits(after)}টি বাকি` },
        body: {
          en: 'Running low. Add copies from your Book List if you have more.',
          bn: 'স্টক ফুরিয়ে আসছে। আরও কপি থাকলে আপনার বইয়ের তালিকা থেকে যোগ করুন।',
        },
        link: '/seller-books',
      }, { except: actor });

      const interested = (await interestedIn(book._id)).filter((person) => person.email !== book.sellerEmail);
      for (const where of ['cart', 'wishlist'] as const) {
        await notify(
          interested.filter((person) => person.where === where).map((person) => person.email),
          {
            // A shopper's alert, under "Deals and price drops" - not the
            // seller's own "Your stock".
            type: 'selling-out',
            title: { en: `Only ${after} left: "${title}"`, bn: `মাত্র ${bnDigits(after)}টি বাকি: "${titleBn}"` },
            body:
              where === 'cart'
                ? { en: 'A book in your cart is selling out.', bn: 'আপনার কার্টের একটি বই শেষ হয়ে আসছে।' }
                : { en: 'A book on your wishlist is selling out.', bn: 'আপনার উইশলিস্টের একটি বই শেষ হয়ে আসছে।' },
            link,
          },
          { except: actor }
        );
      }
    }

    if (before > 0 && after <= 0) {
      await notify([book.sellerEmail], {
        type: 'stock',
        title: { en: `"${title}" has sold out`, bn: `"${titleBn}"-এর স্টক শেষ` },
        body: {
          en: 'Add more copies from your Book List if you have them. Buyers can ask for it meanwhile.',
          bn: 'আরও কপি থাকলে আপনার বইয়ের তালিকা থেকে যোগ করুন। এর মধ্যে ক্রেতারা বইটির জন্য অনুরোধ করতে পারবেন।',
        },
        link: '/seller-books',
      }, { except: actor });
    }

    if (before <= 0 && after > 0) {
      const waiting = await BookRequest.find({ book: book._id, open: true }, { requester: 1 }).lean();
      if (waiting.length) {
        await notify(waiting.map((request) => request.requester), {
          type: 'back-in-stock',
          title: { en: `"${title}" is back in stock`, bn: `"${titleBn}" আবার স্টকে এসেছে` },
          body: {
            en: `${plural(after, 'copy', 'copies')} available now. You asked to be told.`,
            bn: `এখন ${bnDigits(after)}টি কপি আছে। আপনি জানাতে বলেছিলেন।`,
          },
          link,
        });
        await BookRequest.updateMany(
          { _id: { $in: waiting.map((request) => request._id) } },
          { $set: { open: false, closedAt: new Date() } }
        );
      }
    }
  } catch {
    // notify() logs its own failures; a lookup failing here is the same kind
    // of courtesy lost, and must not undo the change that caused it.
  }
};

/**
 * What one copy costs went from `before` to `after`.
 *
 * A drop is news to everyone with the book in a cart or on a wishlist whose
 * price it now beats - the price it was when they added it, or for entries
 * from before that was kept, the price just now. A book that is sold out is
 * left alone: there is nothing to act on.
 */
export const priceChanged = async (
  book: BookRef & { stock?: number | null },
  before: number,
  after: number,
  { actor }: { actor?: string | null } = {}
): Promise<void> => {
  if (!(after < before) || !(Number(book.stock) > 0)) return;
  const title = book.title || 'A book';
  const titleBn = book.title || 'একটি বই';
  try {
    const interested = (await interestedIn(book._id)).filter((person) => person.email !== book.sellerEmail);
    for (const person of interested) {
      const baseline = person.priceWhenAdded ?? before;
      if (!(after < baseline)) continue;
      await notify([person.email], {
        type: 'price-drop',
        title: {
          en: `Price drop: "${title}" is now ${after} Tk`,
          bn: `দাম কমেছে: "${titleBn}" এখন ${bnDigits(after)} টাকা`,
        },
        body:
          person.where === 'cart'
            ? {
                en: `It was ${baseline} Tk when you put it in your cart.`,
                bn: `কার্টে রাখার সময় দাম ছিল ${bnDigits(baseline)} টাকা।`,
              }
            : {
                en: `It was ${baseline} Tk when you saved it to your wishlist.`,
                bn: `উইশলিস্টে রাখার সময় দাম ছিল ${bnDigits(baseline)} টাকা।`,
              },
        link: `/book/${String(book._id)}`,
      }, { except: actor });
    }
  } catch {
    // As above: a notification is never worth failing the change for.
  }
};
