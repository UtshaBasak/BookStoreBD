import { randomInt } from 'crypto';

import bcryptjs from 'bcryptjs';
import type { Request, RequestHandler } from 'express';

import User, { type UserDocument } from '../models/user.model.js';
import BookRequest from '../models/BookRequest.model.js';
import Notification from '../models/Notification.model.js';
import PushDevice from '../models/PushDevice.model.js';
import ReviewFlag from '../models/ReviewFlag.model.js';
import WantedBook from '../models/WantedBook.model.js';
import { type LeanOrder } from '../models/Order.model.js';
import { CANCELLED, RETURN_WINDOW_DAYS, canCancel, canCancelLines } from '../config/commerce.js';
import { cancelOrderLines } from './order.controller.js';
import { clearCode, consumeOtpAttempt, issueCode } from '../utils/otpStore.js';
import { codeEmail } from '../utils/emailTemplates.js';
import { isDuplicateKeyError } from '../utils/error.js';
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
import { hmacEmail, securityEvent } from '../utils/securityLog.js';
import { anonymousEmail, DELETED_USER_NAME } from '../utils/anonymous.js';
import { createLogger } from '../config/logger.js';
import { destroyAssets } from '../config/cloudinary.js';
import { mailConfigured } from '../utils/mailer.js';
import { recountWishlists } from '../utils/bookStats.js';
import { dispatchShopMail, emailChangedEmail, twoFactorChangedEmail } from '../utils/shopMail.js';
import type {
  ConfirmCodeBody,
  DeleteMeBody,
  EmailChangeBody,
  EmailConfirmBody,
  InviteBody,
  NotificationSettingsBody,
  TwoFactorBody,
  LanguageBody,
} from '../schemas/index.js';
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
    securityEvent(req, 'account.data_exported');

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
  categories: CATEGORIES.filter((category) => category.audience === 'everyone' || category.audience === (role === 'admin' ? 'admins' : 'members')).map((category) => ({
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

/** The account changes an account with no password of its own confirms with an e-mailed code. */
type ConfirmAction = 'delete-account' | 'two-factor-off';

/**
 * Checks the re-confirmation an account change asks for: the password, or -
 * for an account made through Google, which has none - the code sent by
 * `sendConfirmCode`. A code is spent once it has been used.
 */
const confirmedBy = async (
  user: UserDocument,
  { password = '', code = '' }: { password?: string; code?: string },
  action: ConfirmAction
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (user.passwordSet === false) {
    const key = `${action}:${user.email}`;
    if (code && (await consumeOtpAttempt(key, code, 'confirm'))) {
      await clearCode(key, 'confirm');
      return { ok: true };
    }
    return { ok: false, message: code ? 'That code is not correct or has expired. Ask for a new one.' : 'Ask for a code to confirm this.' };
  }
  return password && bcryptjs.compareSync(password, user.password)
    ? { ok: true }
    : { ok: false, message: 'That password is not correct' };
};

/**
 * E-mails a code to confirm deleting the account or turning off two-step
 * sign-in, for an account made through Google: it has no password to give,
 * and the session alone is not enough for either.
 */
export const sendConfirmCode: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { action } = req.body as ConfirmCodeBody;
    const user = await User.findById(actor.id);
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }
    if (user.passwordSet !== false) {
      res.status(400).json({ message: 'Your account has a password: use it to confirm this.' });
      return;
    }
    if (!mailConfigured()) {
      res.status(503).json({ message: 'Codes cannot be sent right now. Please try again later.' });
      return;
    }
    const code = randomInt(100000, 1000000).toString();
    await issueCode(`${action}:${user.email}`, code, 'confirm');
    dispatchShopMail(user.email, codeEmail(action, code));
    res.status(200).json({ message: `We have e-mailed a code to ${user.email}.` });
  } catch (error) {
    next(error);
  }
};

/**
 * Turns two-step sign-in on or off for the caller's account.
 *
 * On is one click: the codes go to the address the account was verified with
 * at sign-up. Off asks for the password - or an e-mailed code, for an account
 * with no password - so a session left open on a shared computer cannot be
 * used to remove the protection. Either way the owner is told by e-mail.
 */
/**
 * The language the site is being read in, kept on the account so what is sent
 * later - e-mails, notifications - arrives in it. The website calls this when
 * the language is switched while signed in.
 */
export const setLanguage: RequestHandler = async (req, res, next) => {
  try {
    const { language } = req.body as LanguageBody;
    await User.updateOne({ _id: actingUser(req).id }, { $set: { language } });
    res.status(200).json({ language });
  } catch (error) {
    next(error);
  }
};

export const setTwoFactor: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { enabled, password, code } = req.body as TwoFactorBody;

    const user = await User.findById(actor.id);
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    if (enabled && !mailConfigured()) {
      res.status(503).json({ message: 'Sign-in codes cannot be sent right now, so two-step sign-in cannot be turned on.' });
      return;
    }
    if (!enabled && user.twoFactor) {
      const check = await confirmedBy(user, { password, code }, 'two-factor-off');
      if (!check.ok) {
        securityEvent(req, 'account.reauth.failure', { extra: { change: '2fa_off' } });
        // 403 rather than 401, as for deleting the account: the session is fine.
        res.status(403).json({ message: check.message });
        return;
      }
    }

    if (Boolean(user.twoFactor) !== enabled) {
      user.twoFactor = enabled;
      await user.save();
      await recordAudit(req, {
        action: enabled ? 'account.two-factor.on' : 'account.two-factor.off',
        targetType: 'user',
        targetId: String(user._id),
      });
      securityEvent(req, enabled ? 'account.2fa.enabled' : 'account.2fa.disabled');
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

const OPEN_STATUS = { $nin: ['Delivered', CANCELLED] };
const shortDate = (date: Date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' });

const byOrderNumber = (lines: readonly LeanOrder[]): Map<string, LeanOrder[]> => {
  const grouped = new Map<string, LeanOrder[]>();
  for (const line of lines) grouped.set(line.orderNumber, [...(grouped.get(line.orderNumber) ?? []), line]);
  return grouped;
};

interface Cancellable {
  orderNumber: string;
  existing: LeanOrder[];
  candidates: LeanOrder[];
  who: 'buyer' | 'seller';
}

/**
 * What stands in the way of closing an account, in words for its owner, and
 * the orders it can cancel on the way - those its owner could cancel
 * themselves. A parcel on its way, a return being decided and money still to
 * be paid out cannot be left with nobody behind them.
 */
const openBusinessOf = async (email: string): Promise<{ blockers: string[]; toCancel: Cancellable[] }> => {
  const blockers: string[] = [];
  const toCancel: Cancellable[] = [];

  const bought = byOrderNumber(await Order.find({ buyerEmail: email, status: OPEN_STATUS }).lean());
  for (const orderNumber of bought.keys()) {
    const existing = await Order.find({ orderNumber }).lean();
    const live = existing.filter((line) => line.status !== CANCELLED);
    if (canCancelLines('buyer', live)) toCancel.push({ orderNumber, existing, candidates: live, who: 'buyer' });
    else blockers.push(`Order ${orderNumber} is being prepared or is on its way to you. You can close your account once it has been delivered.`);
  }

  const sold = byOrderNumber(await Order.find({ sellerEmail: email, status: OPEN_STATUS }).lean());
  for (const [orderNumber, mine] of sold) {
    if (mine.every((line) => canCancel('seller', line.status))) {
      toCancel.push({ orderNumber, existing: await Order.find({ orderNumber }).lean(), candidates: mine, who: 'seller' });
    } else {
      blockers.push(`Your books in order ${orderNumber} have been shipped. You can close your account once they are delivered and paid out.`);
    }
  }

  const returns = await ReturnRequest.find(
    { status: 'pending', $or: [{ userEmail: email }, { sellerEmail: email }] },
    { orderNumber: 1, bookTitle: 1 }
  ).lean();
  for (const request of returns) {
    blockers.push(`The return of "${request.bookTitle}" (order ${request.orderNumber}) is still being decided.`);
  }

  const unpaid = await Order.find(
    { sellerEmail: email, status: 'Delivered', sellerPaidAt: null, isReturned: { $ne: 1 } },
    { orderNumber: 1, deliveredAt: 1 }
  ).lean();
  const returned = new Set(
    (await ReturnRequest.find({ orderId: { $in: unpaid.map((line) => line._id) }, status: 'approved' }, { orderId: 1 }).lean()).map((r) =>
      String(r.orderId)
    )
  );
  for (const [orderNumber, lines] of byOrderNumber(unpaid.filter((line) => !returned.has(String(line._id))) as LeanOrder[])) {
    const deliveredAt = lines[0]?.deliveredAt ?? new Date();
    const due = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * DAY_MS);
    blockers.push(`We still owe you for order ${orderNumber}, payable from ${shortDate(due)}. You can close your account once it has been paid.`);
  }

  return { blockers, toCancel };
};

/**
 * Takes every personal detail out of the shop's records and removes the
 * account: the step after `openBusinessOf` has found nothing in the way.
 *
 * Orders are kept and anonymised rather than deleted. They are accounting
 * records and the other side of each one is somebody else's history; what goes
 * is every personal detail attached to them. Article 17 allows exactly this,
 * and a shop that deleted its own sales ledger on request would not survive an
 * audit.
 */
const eraseAccount = async (user: UserDocument) => {
  const email = user.email;
  // A form that cannot be traced back, but still groups the rows that used to
  // belong to one person.
  const tombstone = anonymousEmail();

  const anonymise = {
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    deliveryAddress: '',
  };

  // Their listings come out of other people's carts and wishlists too, rather
  // than lingering there pointing at nothing.
  const listed = (await AddBook.find({ sellerEmail: email }, { _id: 1 }).lean()).map((book) => book._id);
  await Promise.all([Cart.deleteMany({ book: { $in: listed } }), Wishlist.deleteMany({ book: { $in: listed } })]);

  const [ordersPlaced, sales, purchases, returns, , listings, sent, received, reviews, sellerRatings] = await Promise.all([
    Order.updateMany({ buyerEmail: email }, { $set: { buyerEmail: tombstone, ...anonymise } }),
    Order.updateMany({ sellerEmail: email }, { $set: { sellerEmail: tombstone } }),
    Purchase.updateMany({ userEmail: email }, { $set: { userEmail: tombstone } }),
    // The bKash number goes with the name: it identifies a person as surely.
    ReturnRequest.updateMany({ userEmail: email }, { $set: { userEmail: tombstone, refundBkash: '' } }),
    ReturnRequest.updateMany({ sellerEmail: email }, { $set: { sellerEmail: tombstone } }),
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
    Review.updateMany({ reviewerEmail: email }, { $set: { reviewerEmail: tombstone, reviewerName: DELETED_USER_NAME } }),
    SellerReview.updateMany({ reviewerEmail: email }, { $set: { reviewerEmail: tombstone, reviewerName: DELETED_USER_NAME } }),
  ]);

  // Ratings of their shop go with it, as its listings do.
  const ratingsOfShop = await SellerReview.find({ $or: [{ seller: user._id }, { sellerEmail: email }] }, { _id: 1 }).lean();
  await Promise.all([
    SellerReview.deleteMany({ _id: { $in: ratingsOfShop.map((rating) => rating._id) } }),
    SellerReviewFlag.deleteMany({ review: { $in: ratingsOfShop.map((rating) => rating._id) } }),
  ]);

  // The books they had saved lose one wishlist each; what was only theirs -
  // their bell, their requests, their devices - goes.
  const saved = await Wishlist.find({ user: user._id }, { book: 1 }).lean();
  await Promise.all([
    Cart.deleteMany({ user: user._id }),
    Wishlist.deleteMany({ user: user._id }),
    Notification.deleteMany({ recipient: email }),
    BookRequest.deleteMany({ $or: [{ requester: email }, { sellerEmail: email }] }),
    WantedBook.updateMany({ 'requesters.email': email }, { $pull: { requesters: { email } }, $inc: { requesterCount: -1 } }),
    PushDevice.deleteMany({ user: user._id }),
    revokeAllForUser(user._id),
  ]);
  await recountWishlists(saved.map((entry) => entry.book));

  await User.findByIdAndDelete(user._id);
  // Their banners, when they were hosted: the account they decorated is gone.
  await destroyAssets([user.buyerBannerPublicId, user.sellerBannerPublicId]);

  return {
    ordersAnonymised: ordersPlaced.modifiedCount + sales.modifiedCount,
    purchasesAnonymised: purchases.modifiedCount,
    returnsAnonymised: returns.modifiedCount,
    listingsRemoved: listings.deletedCount,
    messagesAnonymised: sent.modifiedCount + received.modifiedCount,
    reviewsAnonymised: reviews.modifiedCount + sellerRatings.modifiedCount,
    ratingsOfShopRemoved: ratingsOfShop.length,
  };
};

export type CloseResult =
  | { ok: true; summary: Awaited<ReturnType<typeof eraseAccount>> }
  | { ok: false; message: string; blockers: string[] };

/**
 * Closes an account, by its owner or by an administrator, the same way.
 *
 * First what is in the way, if anything: then nothing changes, and the
 * answer says what to wait for. Otherwise the orders its owner could cancel
 * are cancelled - the stock goes back and the other side is told - and the
 * account is erased.
 */
export const closeAccount = async (user: UserDocument, req: Request, { by }: { by: 'self' | 'admin' }): Promise<CloseResult> => {
  const refused = (blockers: string[]): CloseResult => ({
    ok: false,
    message: by === 'self' ? "Your account can't be closed just yet." : "This account can't be deleted yet.",
    blockers,
  });

  const first = await openBusinessOf(user.email);
  if (first.blockers.length) return refused(first.blockers);

  for (const order of first.toCancel) {
    await cancelOrderLines(req, {
      ...order,
      who: by === 'admin' ? 'admin' : order.who,
      reason: by === 'admin' ? 'The account was closed by the shop.' : order.who === 'buyer' ? 'The buyer closed their account.' : 'The seller closed their account.',
    });
  }

  // Something may have moved on while the orders were being cancelled.
  const again = await openBusinessOf(user.email);
  if (again.blockers.length || again.toCancel.length) {
    return refused(again.blockers.length ? again.blockers : ['An order changed while the account was being closed. Please try again.']);
  }

  return { ok: true, summary: await eraseAccount(user) };
};

/**
 * Deletes the caller's own account.
 *
 * Re-authenticated with the password - or, for an account made through
 * Google, an e-mailed code - rather than the access token alone: this cannot
 * be undone, and a token lifted from a borrowed laptop should not be enough to
 * erase somebody's account.
 */
export const deleteMyAccount: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { password, code } = req.body as DeleteMeBody;

    const user = await User.findById(actor.id);
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }

    const check = await confirmedBy(user, { password, code }, 'delete-account');
    if (!check.ok) {
      securityEvent(req, 'account.reauth.failure', { extra: { change: 'delete_account' } });
      // 403, not 401. The client treats a 401 as an expired session: it tries a
      // refresh and then signs the caller out, so a mistyped password would
      // sign somebody out of the page they were on. They are authenticated;
      // what failed is the re-check this one action asks for.
      res.status(403).json({ message: check.message });
      return;
    }

    const result = await closeAccount(user, req, { by: 'self' });
    if (!result.ok) {
      res.status(409).json({ code: 'account-has-open-business', message: result.message, blockers: result.blockers });
      return;
    }
    // The actor was read when the request was signed in, so the record can
    // still name them once the account has gone.
    await recordAudit(req, { action: 'account.delete', targetType: 'user', targetId: String(user._id), details: result.summary });
    securityEvent(req, 'account.deleted');
    clearRefreshCookie(res);

    log.info({ ...result.summary }, 'Account deleted at the owner’s request');
    res.status(200).json({ message: 'Your account has been deleted.', ...result.summary });
  } catch (error) {
    next(error);
  }
};

/**
 * Asks to move the account to another e-mail address.
 *
 * With the password, so an open session alone cannot hand the account to
 * someone else's address, and confirmed by a code sent to the new address, so
 * the account only moves to an address its owner can read. An account made
 * through Google sets a password first: without one, and with Google tied to
 * the old address, there would be no way to sign in at the new one.
 */
export const requestEmailChange: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { newEmail, password } = req.body as EmailChangeBody;
    const user = await User.findById(actor.id);
    if (!user) {
      res.status(404).json({ message: 'Account not found' });
      return;
    }
    if (user.passwordSet === false) {
      res.status(409).json({
        code: 'password-needed',
        message: 'Set a password first, below, so you can sign in with your new address.',
      });
      return;
    }
    if (!bcryptjs.compareSync(password, user.password)) {
      securityEvent(req, 'account.reauth.failure', { extra: { change: 'email' } });
      res.status(403).json({ code: 'current-password', message: 'That password is not correct' });
      return;
    }
    if (newEmail === user.email) {
      res.status(400).json({ message: 'That is the address your account already uses.' });
      return;
    }
    if (await User.exists({ email: String(newEmail) })) {
      res.status(409).json({ message: 'Another account already uses that address.' });
      return;
    }
    if (!mailConfigured()) {
      res.status(503).json({ message: 'Codes cannot be sent right now. Please try again later.' });
      return;
    }

    user.pendingEmail = newEmail;
    await user.save();
    const code = randomInt(100000, 1000000).toString();
    await issueCode(`${String(user._id)}:${newEmail}`, code, 'email-change');
    dispatchShopMail(newEmail, codeEmail('email-change', code));
    res.status(200).json({ message: `We have e-mailed a code to ${newEmail}. Enter it to finish.`, pendingEmail: newEmail });
  } catch (error) {
    next(error);
  }
};

/**
 * Moves the account to the address it asked for, once the code sent there is
 * given: the account itself, and every record that names the person by their
 * address, so their orders, listings, chats and reviews come with them. The
 * old address is told.
 */
export const confirmEmailChange: RequestHandler = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { code } = req.body as EmailConfirmBody;
    const user = await User.findById(actor.id);
    if (!user?.pendingEmail) {
      res.status(400).json({ message: 'There is no change of address waiting. Start again.' });
      return;
    }
    const from = user.email;
    const to = user.pendingEmail;
    const key = `${String(user._id)}:${to}`;
    if (!(await consumeOtpAttempt(key, code, 'email-change'))) {
      res.status(400).json({ message: 'That code is not correct or has expired. Ask for a new one.' });
      return;
    }

    // The account first, claiming the address: if someone took it in the
    // meantime, the unique index says so and nothing else has moved.
    try {
      await User.updateOne(
        { _id: user._id, email: from },
        // Google is tied to the old address; it links again on the next
        // Google sign-in with the new one.
        { $set: { email: to, pendingEmail: null }, $unset: { googleId: '' } }
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        res.status(409).json({ message: 'Another account already uses that address.' });
        return;
      }
      throw error;
    }
    await clearCode(key, 'email-change');

    await Promise.all([
      Order.updateMany({ buyerEmail: from }, { $set: { buyerEmail: to } }),
      // An order's e-mails follow the account when they went to its address.
      Order.updateMany({ buyerEmail: { $in: [from, to] }, contactEmail: from }, { $set: { contactEmail: to } }),
      Order.updateMany({ sellerEmail: from }, { $set: { sellerEmail: to } }),
      AddBook.updateMany({ sellerEmail: from }, { $set: { sellerEmail: to } }),
      Purchase.updateMany({ userEmail: from }, { $set: { userEmail: to } }),
      ReturnRequest.updateMany({ userEmail: from }, { $set: { userEmail: to } }),
      ReturnRequest.updateMany({ sellerEmail: from }, { $set: { sellerEmail: to } }),
      Chat.updateMany({ sender: from }, { $set: { sender: to } }),
      Chat.updateMany({ receiver: from }, { $set: { receiver: to } }),
      Review.updateMany({ reviewerEmail: from }, { $set: { reviewerEmail: to } }),
      Review.updateMany({ 'reply.byEmail': from }, { $set: { 'reply.byEmail': to } }),
      SellerReview.updateMany({ reviewerEmail: from }, { $set: { reviewerEmail: to } }),
      SellerReview.updateMany({ sellerEmail: from }, { $set: { sellerEmail: to } }),
      ReviewFlag.updateMany({ reporterEmail: from }, { $set: { reporterEmail: to } }),
      SellerReviewFlag.updateMany({ reporterEmail: from }, { $set: { reporterEmail: to } }),
      Notification.updateMany({ recipient: from }, { $set: { recipient: to } }),
      BookRequest.updateMany({ requester: from }, { $set: { requester: to } }),
      BookRequest.updateMany({ sellerEmail: from }, { $set: { sellerEmail: to } }),
      WantedBook.updateMany({ 'requesters.email': from }, { $set: { 'requesters.$[who].email': to } }, { arrayFilters: [{ 'who.email': from }] }),
      Invite.updateMany({ inviterEmail: from }, { $set: { inviterEmail: to } }),
    ]);

    await recordAudit(req, { action: 'account.email', targetType: 'user', targetId: String(user._id), details: { from, to } });
    // Hashes of both, so the change can be followed from either address.
    securityEvent(req, 'account.email.changed', { email: from, extra: { new_email_hash: hmacEmail(to) } });
    dispatchShopMail(from, emailChangedEmail(to));

    res.status(200).json({ message: `Your account now uses ${to}.`, email: to });
  } catch (error) {
    next(error);
  }
};
