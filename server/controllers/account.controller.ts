import bcryptjs from 'bcryptjs';
import type { RequestHandler } from 'express';

import User from '../models/user.model.js';
import AddBook from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import Chat from '../models/Chat.model.js';
import Order from '../models/Order.model.js';
import Purchase from '../models/Purchase.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Review from '../models/Review.model.js';
import SellerReview from '../models/SellerReview.model.js';
import SellerReviewFlag from '../models/SellerReviewFlag.model.js';
import Wishlist from '../models/Wishlist.model.js';
import { actingUser } from '../middleware/auth.js';
import { revokeAllForUser } from '../utils/refreshToken.js';
import { clearRefreshCookie } from '../utils/authCookies.js';
import { recordAudit } from '../utils/audit.js';
import { anonymousEmail, DELETED_USER_NAME } from '../utils/anonymous.js';
import { createLogger } from '../config/logger.js';
import { destroyAssets } from '../config/cloudinary.js';
import { mailConfigured } from '../utils/mailer.js';
import { recountWishlists } from '../utils/bookStats.js';
import { dispatchShopMail, twoFactorChangedEmail } from '../utils/shopMail.js';
import type { InviteBody, NotificationSettingsBody, TwoFactorBody } from '../schemas/index.js';
import Invite from '../models/Invite.model.js';
import { inviteEmail } from '../utils/shopMail.js';
import { CATEGORIES, cleanPrefs, wants } from '../utils/notificationPrefs.js';
import type { InviteList, NotificationPrefs, NotificationSettings } from '@shared/api.js';

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

    const [orders, sales, purchases, returns, cart, wishlist, messages, reviews, listings, sellerRatings, ratingsReceived] =
      await Promise.all([
        Order.find({ buyerEmail: user.email }).lean(),
        Order.find({ sellerEmail: user.email }).lean(),
        Purchase.find({ userEmail: user.email }).lean(),
        ReturnRequest.find({ userEmail: user.email }).lean(),
        Cart.find({ user: user._id }).populate('book', 'title author price').lean(),
        Wishlist.find({ user: user._id }).populate('book', 'title author price').lean(),
        Chat.find({ $or: [{ sender: user.email }, { receiver: user.email }] }).lean(),
        Review.find({ reviewerEmail: user.email }).lean(),
        AddBook.find({ sellerEmail: user.email }).lean(),
        SellerReview.find({ reviewerEmail: user.email }).lean(),
        SellerReview.find({ sellerEmail: user.email }).lean(),
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
      reviews,
      sellerRatings,
      ratingsReceived,
    });
  } catch (error) {
    next(error);
  }
};

/** Invitations one member may send in a day, and how soon one address may be e-mailed again. */
export const INVITES_PER_DAY = 20;
const REINVITE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const invitesLeftToday = async (inviterEmail: string): Promise<number> =>
  Math.max(0, INVITES_PER_DAY - (await Invite.countDocuments({ inviterEmail, createdAt: { $gt: new Date(Date.now() - DAY_MS) } })));

/**
 * Invites friends by e-mail: who is inviting them, what the shop is, and a
 * link to join.
 *
 * The answer is the same whether or not an address already has an account -
 * otherwise this would be a way to find out who shops here - and a member is
 * simply not e-mailed. An address is e-mailed at most once a week whoever
 * invites it, links are not allowed in the note, and a member may send a
 * limited number a day, so an invitation cannot be turned into spam.
 */
export const sendInvites: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { emails, note = '' } = req.body as InviteBody;
    if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|xyz|io|ly|me|info|bd)\b/i.test(note)) {
      res.status(400).json({ message: 'Leave links out of the note - a few words of your own is perfect.' });
      return;
    }

    const inviter = await User.findById(actor.id).select('username email').lean();
    if (!inviter) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    const addresses = [...new Set(emails.map((address) => address.toLowerCase()))].filter((address) => address !== inviter.email);
    // Each address once per inviter: asking again sends nothing new.
    const already = new Set(
      (await Invite.find({ inviterEmail: inviter.email, inviteeEmail: { $in: addresses } }, { inviteeEmail: 1 }).lean()).map(
        (invite) => invite.inviteeEmail
      )
    );
    const toInvite = addresses.filter((address) => !already.has(address));

    const left = await invitesLeftToday(inviter.email);
    if (toInvite.length > left) {
      res.status(429).json({
        message: left ? `You can send ${left} more ${left === 1 ? 'invitation' : 'invitations'} today.` : 'That is all the invitations for today. Try again tomorrow.',
      });
      return;
    }

    const members = new Set((await User.find({ email: { $in: toInvite } }, { email: 1 }).lean()).map((user) => user.email));
    const recentlyEmailed = new Set(
      (
        await Invite.find(
          { inviteeEmail: { $in: toInvite }, emailed: true, createdAt: { $gt: new Date(Date.now() - REINVITE_AFTER_MS) } },
          { inviteeEmail: 1 }
        ).lean()
      ).map((invite) => invite.inviteeEmail)
    );

    const mail = inviteEmail(inviter.username, note);
    for (const address of toInvite) {
      const send = !members.has(address) && !recentlyEmailed.has(address);
      await Invite.create({ inviterEmail: inviter.email, inviteeEmail: address, emailed: send });
      if (send) dispatchShopMail(address, mail);
    }

    const count = addresses.length;
    res.status(200).json({
      message: count ? `Invitation sent to ${count} ${count === 1 ? 'friend' : 'friends'}. Thank you!` : 'Add a friend’s address, not your own.',
      sent: count,
    });
  } catch (error) {
    next(error);
  }
};

/** Who the caller has invited, newest first, and whether they joined. */
export const listInvites: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const invites = await Invite.find({ inviterEmail: actor.email }).sort({ createdAt: -1 }).limit(50).lean();
    const body: InviteList = {
      items: invites.map((invite) => ({
        email: invite.inviteeEmail,
        invitedAt: new Date(invite.createdAt).toISOString(),
        joined: Boolean(invite.joinedAt),
      })),
      remainingToday: await invitesLeftToday(actor.email),
    };
    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
};

/** The caller's notification choices, with what each category covers. */
const settingsFor = (role: string, prefs: NotificationPrefs): NotificationSettings => ({
  categories: CATEGORIES.filter((category) => !category.adminOnly || role === 'admin').map((category) => ({
    id: category.id,
    label: category.label,
    description: category.description,
    emailAvailable: category.email,
    inApp: wants(prefs, category.id, 'inApp'),
    email: category.email && wants(prefs, category.id, 'email'),
  })),
});

export const getNotificationSettings: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const user = await User.findById(actor.id).select('role notificationPrefs').lean();
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }
    res.status(200).json(settingsFor(user.role, (user.notificationPrefs ?? {}) as NotificationPrefs));
  } catch (error) {
    next(error);
  }
};

export const updateNotificationSettings: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { prefs } = req.body as NotificationSettingsBody;
    const user = await User.findById(actor.id).select('role notificationPrefs');
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }
    const merged = cleanPrefs({ ...((user.notificationPrefs ?? {}) as NotificationPrefs), ...prefs });
    user.notificationPrefs = merged;
    user.markModified('notificationPrefs');
    await user.save();
    res.status(200).json(settingsFor(user.role, merged));
  } catch (error) {
    next(error);
  }
};

/**
 * Turns two-step sign-in on or off for the caller's account.
 *
 * On is one click: the codes go to the address the account was verified with
 * at sign-up. Off asks for the password, so a session left open on a shared
 * computer cannot be used to remove the protection. Either way the owner is
 * told by e-mail.
 */
export const setTwoFactor: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { enabled, password = '' } = req.body as TwoFactorBody;

    const user = await User.findById(actor.id);
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    if (enabled && !mailConfigured()) {
      res.status(503).json({ message: 'Sign-in codes cannot be sent right now, so two-step sign-in cannot be turned on.' });
      return;
    }
    // 403 rather than 401, as for deleting the account: the session is fine.
    if (!enabled && !bcryptjs.compareSync(password, user.password)) {
      res.status(403).json({ message: 'That password is not correct' });
      return;
    }

    if (Boolean(user.twoFactor) !== enabled) {
      user.twoFactor = enabled;
      await user.save();
      await recordAudit(req, {
        action: enabled ? 'account.two-factor.on' : 'account.two-factor.off',
        targetType: 'user',
        targetId: String(user._id),
      });
      dispatchShopMail(user.email, twoFactorChangedEmail(enabled));
    }

    res.status(200).json({
      message: enabled
        ? 'Two-step sign-in is on. Next time you sign in, we will e-mail you a code.'
        : 'Two-step sign-in is off.',
      twoFactor: enabled,
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
      // refresh and then signs the caller out, so a mistyped password would
      // sign somebody out of the page they were on. They are authenticated;
      // what failed is the re-check this one action asks for.
      res.status(403).json({ message: 'That password is not correct' });
      return;
    }

    const email = user.email;
    // A form that cannot be traced back, but still groups the rows that used to
    // belong to one person.
    const tombstone = anonymousEmail();

    const anonymise = {
      contactName: '',
      contactPhone: '',
      deliveryAddress: '',
    };

    const [ordersPlaced, sales, purchases, returns, listings, sent, received, reviews, sellerRatings] =
      await Promise.all([
      Order.updateMany({ buyerEmail: email }, { $set: { buyerEmail: tombstone, ...anonymise } }),
      Order.updateMany({ sellerEmail: email }, { $set: { sellerEmail: tombstone } }),
      Purchase.updateMany({ userEmail: email }, { $set: { userEmail: tombstone } }),
      // The bKash number goes with the name: it identifies a person as surely.
      ReturnRequest.updateMany(
        { userEmail: email },
        { $set: { userEmail: tombstone, refundBkash: '' } }
      ),
      // A listing with no seller behind it cannot be bought, so it goes. The
      // orders above keep their own copy of the title and price, so the history
      // of what was sold survives the listing being removed.
      AddBook.deleteMany({ sellerEmail: email }),
      // Messages are kept and attributed to a deleted user rather than removed.
      // A conversation is two people's, not one's: deleting it takes the other
      // side's record of what was agreed with it, and what was agreed is often
      // the whole reason they still have the thread.
      Chat.updateMany({ sender: email }, { $set: { sender: tombstone } }),
      Chat.updateMany({ receiver: email }, { $set: { receiver: tombstone } }),
      // Reviews stay for the same reason: the next buyer's decision rests on
      // them, and a score that dropped every time somebody closed an account
      // would be worth nothing. The name goes.
      Review.updateMany(
        { reviewerEmail: email },
        { $set: { reviewerEmail: tombstone, reviewerName: DELETED_USER_NAME } }
      ),
      SellerReview.updateMany(
        { reviewerEmail: email },
        { $set: { reviewerEmail: tombstone, reviewerName: DELETED_USER_NAME } }
      ),
    ]);

    // Ratings of their shop go with it, as its listings do.
    const ratingsOfShop = await SellerReview.find({ sellerEmail: email }, { _id: 1 }).lean();
    await Promise.all([
      SellerReview.deleteMany({ sellerEmail: email }),
      SellerReviewFlag.deleteMany({ review: { $in: ratingsOfShop.map((rating) => rating._id) } }),
    ]);

    // The books they had saved lose one wishlist each.
    const saved = await Wishlist.find({ user: user._id }, { book: 1 }).lean();
    await Promise.all([
      Cart.deleteMany({ user: user._id }),
      Wishlist.deleteMany({ user: user._id }),
      revokeAllForUser(user._id),
    ]);
    await recountWishlists(saved.map((entry) => entry.book));

    const summary = {
      ordersAnonymised: ordersPlaced.modifiedCount + sales.modifiedCount,
      purchasesAnonymised: purchases.modifiedCount,
      returnsAnonymised: returns.modifiedCount,
      listingsRemoved: listings.deletedCount,
      messagesAnonymised: sent.modifiedCount + received.modifiedCount,
      reviewsAnonymised: reviews.modifiedCount + sellerRatings.modifiedCount,
      ratingsOfShopRemoved: ratingsOfShop.length,
    };

    // Recorded before the account goes, while there is still an actor to name.
    await recordAudit(req, {
      action: 'account.delete',
      targetType: 'user',
      targetId: String(user._id),
      details: summary,
    });

    await User.findByIdAndDelete(user._id);
    // Their banners, when they were hosted: the account they decorated is gone.
    await destroyAssets([user.buyerBannerPublicId, user.sellerBannerPublicId]);
    clearRefreshCookie(res);

    log.info({ ...summary }, 'Account deleted at the owner’s request');
    res.status(200).json({ message: 'Your account has been deleted.', ...summary });
  } catch (error) {
    next(error);
  }
};
