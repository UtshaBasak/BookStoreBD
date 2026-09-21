import { randomUUID } from 'crypto';

import bcryptjs from 'bcryptjs';
import type { RequestHandler } from 'express';

import User from '../models/user.model.js';
import AddBook from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import Chat from '../models/Chat.model.js';
import Order from '../models/Order.model.js';
import Purchase from '../models/Purchase.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Wishlist from '../models/Wishlist.model.js';
import { actingUser } from '../middleware/auth.js';
import { revokeAllForUser } from '../utils/refreshToken.js';
import { clearRefreshCookie } from '../utils/authCookies.js';
import { recordAudit } from '../utils/audit.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('account');

/**
 * Everything the account owner is entitled to a copy of.
 *
 * Article 15 of the GDPR, and a plain trust signal anywhere else: a shop that
 * will not show you what it holds looks like a shop with something to hide.
 * Sent as a download rather than a page, because it is a file to keep.
 */
export const exportMyData: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);

    const user = await User.findById(actor.id).select('-password').lean();
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    const [orders, sales, purchases, returns, cart, wishlist, messages, listings] =
      await Promise.all([
        Order.find({ buyerEmail: user.email }).lean(),
        Order.find({ sellerEmail: user.email }).lean(),
        Purchase.find({ userEmail: user.email }).lean(),
        ReturnRequest.find({ userEmail: user.email }).lean(),
        Cart.find({ user: user._id }).populate('book', 'title author price').lean(),
        Wishlist.find({ user: user._id }).populate('book', 'title author price').lean(),
        Chat.find({ $or: [{ sender: user.email }, { receiver: user.email }] }).lean(),
        AddBook.find({ sellerEmail: user.email }).lean(),
      ]);

    const filename = `bookstorebd-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.status(200).json({
      exportedAt: new Date().toISOString(),
      // Named rather than dumped, so the file explains itself to whoever opens
      // it - which may be the person, and may be a regulator.
      account: user,
      ordersPlaced: orders,
      ordersReceivedAsSeller: sales,
      purchases,
      returnRequests: returns,
      cart,
      wishlist,
      listings,
      messages,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Deletes the caller's own account.
 *
 * Re-authenticated with the password rather than the access token alone: this
 * cannot be undone, and a token lifted from a borrowed laptop should not be
 * enough to erase somebody's account.
 *
 * Orders are kept and anonymised rather than deleted. They are accounting
 * records and the other side of each one is somebody else's history; what goes
 * is every personal detail attached to them. Article 17 allows exactly this,
 * and a shop that deleted its own sales ledger on request would not survive an
 * audit.
 */
export const deleteMyAccount: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { password } = req.body as { password: string };

    const user = await User.findById(actor.id);
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    if (!bcryptjs.compareSync(password, user.password)) {
      // 403, not 401. The client treats a 401 as an expired session: it tries a
      // refresh and then signs the caller out, so a typo here would have logged
      // somebody out of the page they were standing on. They are authenticated;
      // what failed is the re-check this one action asks for.
      res.status(403).json({ message: 'That password is not correct' });
      return;
    }

    const email = user.email;
    // A form that cannot be traced back, but still groups the rows that used to
    // belong to one person. `.invalid` is reserved for exactly this by RFC 2606.
    const tombstone = `deleted-${randomUUID().slice(0, 8)}@removed.invalid`;

    const anonymise = {
      contactName: '',
      contactPhone: '',
      deliveryAddress: '',
    };

    const [ordersPlaced, sales, purchases, returns, listings, conversations] = await Promise.all([
      Order.updateMany({ buyerEmail: email }, { $set: { buyerEmail: tombstone, ...anonymise } }),
      Order.updateMany({ sellerEmail: email }, { $set: { sellerEmail: tombstone } }),
      Purchase.updateMany({ userEmail: email }, { $set: { userEmail: tombstone } }),
      ReturnRequest.updateMany({ userEmail: email }, { $set: { userEmail: tombstone } }),
      // A listing with no seller behind it cannot be bought, so it goes. The
      // orders above keep their own copy of the title and price, so the history
      // of what was sold survives the listing being removed.
      AddBook.deleteMany({ sellerEmail: email }),
      // A conversation exists only between its two people and ends with the
      // account. The order record is what holds any agreement that came out of
      // it, and that is kept.
      Chat.deleteMany({ $or: [{ sender: email }, { receiver: email }] }),
    ]);

    await Promise.all([
      Cart.deleteMany({ user: user._id }),
      Wishlist.deleteMany({ user: user._id }),
      revokeAllForUser(user._id),
    ]);

    const summary = {
      ordersAnonymised: ordersPlaced.modifiedCount + sales.modifiedCount,
      purchasesAnonymised: purchases.modifiedCount,
      returnsAnonymised: returns.modifiedCount,
      listingsRemoved: listings.deletedCount,
      messagesRemoved: conversations.deletedCount,
    };

    // Recorded before the account goes, while there is still an actor to name.
    await recordAudit(req, {
      action: 'account.delete',
      targetType: 'user',
      targetId: String(user._id),
      details: summary,
    });

    await User.findByIdAndDelete(user._id);
    clearRefreshCookie(res);

    log.info({ ...summary }, 'Account deleted at the owner’s request');
    res.status(200).json({ message: 'Your account has been deleted.', ...summary });
  } catch (error) {
    next(error);
  }
};
