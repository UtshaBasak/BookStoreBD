import express, { type Request, type Response } from 'express';

import { signup, signin } from '../controllers/auth.controller.js';
import {
  getUserProfile,
  updateUserProfile,
} from '../controllers/user.controller.js';
import {
  deleteMyAccount,
  exportMyData,
  getNotificationSettings,
  setTwoFactor,
  updateNotificationSettings,
} from '../controllers/account.controller.js';
import { sellerRatingOf } from '../controllers/sellerReview.controller.js';
import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';
import User from '../models/user.model.js';
import { API_PREFIX } from '../config/apiPaths.js';
import { config } from '../config/env.js';
import { actingUser, requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { imageUpload, verifyImageBytes } from '../middleware/imageUpload.js';
import { recordAudit } from '../utils/audit.js';
import { collectImages } from '../utils/uploadedImages.js';
import { serveStoredImage } from '../utils/serveImage.js';
import { createLogger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import { contains } from '../utils/regex.js';
import { discountProblem } from '../config/pricing.js';
import {
  authSchemas,
  userSchemas,
  type AddBookBody,
  type AdminUserQuery,
  type EmailParams,
  type IdParams,
} from '../schemas/index.js';

const log = createLogger('user-routes');

const router = express.Router();

/**
 * Reads back the Cloudinary URLs the browser reports after a direct upload.
 *
 * Each one is checked against this account's delivery host. The client is
 * telling the server what to store, so without that check a caller could pin
 * any URL they liked to a listing and have it rendered to every visitor.
 */

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

// Kept as aliases of /auth/signup and /auth/signin for existing callers.
// Validated with the same schemas: an alias that skipped validation would be a
// way in around the rules the canonical route enforces.
router.post('/signup', validate(authSchemas.signup), signup);
router.post('/signin', validate(authSchemas.signin), signin);

// A listing shows its seller's public details, so this stays readable without
// a token; the handler only ever returns non-sensitive fields.
router.get('/profile', optionalAuth, validate(userSchemas.profileQuery), getUserProfile);

/**
 * Somebody's profile picture, as an image.
 *
 * Stored on the account as a base64 data URI and served here by address, so a
 * list of people does not carry their photographs. Public, like the profile
 * endpoint, and cacheable, which a data URI in a JSON body is not.
 */
router.get(
  '/:email/avatar',
  validate(userSchemas.avatar),
  async (req: Request<EmailParams>, res: Response, next) => {
    try {
      const user = await User.findOne({ email: req.params.email }).select('profilePicture').lean();

      if (!serveStoredImage(req, res, user?.profilePicture)) {
        res.status(404).json({ message: 'No profile picture' });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * A seller's shop front: who they are and how their shop is doing. Public,
 * like the name and picture on a listing already are; the books themselves
 * come from the catalogue, `/filter/booklist?seller=`.
 */
router.get(
  '/shop/:username',
  validate(userSchemas.shop),
  async (req: Request<{ username: string }>, res: Response, next) => {
    try {
      const user = await User.findOne(
        { username: req.params.username },
        { username: 1, email: 1, profilePicture: 1, sellerBanner: 1, createdAt: 1, updatedAt: 1 }
      ).lean();
      if (!user) {
        res.status(404).json({ message: 'No shop by that name' });
        return;
      }

      const [books, inStock, sold, rated, sellerRating] = await Promise.all([
        AddBook.countDocuments({ sellerEmail: user.email }),
        AddBook.countDocuments({ sellerEmail: user.email, stock: { $gt: 0 } }),
        Order.aggregate<{ copies: number }>([
          { $match: { sellerEmail: user.email, status: { $ne: 'Cancelled' }, isReturned: { $ne: 1 } } },
          { $group: { _id: null, copies: { $sum: { $ifNull: ['$quantity', 1] } } } },
        ]),
        AddBook.aggregate<{ average: number; count: number }>([
          { $match: { sellerEmail: user.email, ratingCount: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              count: { $sum: '$ratingCount' },
              weighted: { $sum: { $multiply: ['$ratingAverage', '$ratingCount'] } },
            },
          },
          { $project: { count: 1, average: { $divide: ['$weighted', '$count'] } } },
        ]),
        sellerRatingOf(user.email),
      ]);
      if (books === 0) {
        res.status(404).json({ message: 'That account has no shop yet' });
        return;
      }

      const version = user.updatedAt ? new Date(user.updatedAt).getTime() : 0;
      const banner = user.sellerBanner
        ? /^https?:\/\//.test(user.sellerBanner)
          ? user.sellerBanner
          : `${API_PREFIX}/user/${encodeURIComponent(user.email)}/banner/seller?v=${version}`
        : null;

      res.json({
        id: String(user._id),
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture || null,
        sellerBanner: banner,
        joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        books,
        inStock,
        sold: sold[0]?.copies ?? 0,
        ratingAverage: rated[0] ? Math.round(rated[0].average * 10) / 10 : 0,
        ratingCount: rated[0]?.count ?? 0,
        sellerRating,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * One of somebody's two profile banners, as an image. Only reached for a
 * banner kept inline; a hosted one is linked to directly.
 */
router.get(
  '/:email/banner/:role',
  validate(userSchemas.banner),
  async (req: Request<{ email: string; role: 'buyer' | 'seller' }>, res: Response, next) => {
    try {
      const field = req.params.role === 'seller' ? 'sellerBanner' : 'buyerBanner';
      const user = await User.findOne({ email: req.params.email }).select(field).lean();

      if (!serveStoredImage(req, res, user?.[field])) {
        res.status(404).json({ message: 'No banner' });
      }
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Authenticated
// ---------------------------------------------------------------------------

router.put(
  '/profile',
  requireAuth,
  imageUpload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'buyerBanner', maxCount: 1 },
    { name: 'sellerBanner', maxCount: 1 },
  ]),
  verifyImageBytes,
  // After multer, which is what populates req.body for a multipart form.
  validate(userSchemas.updateProfile),
  updateUserProfile
);

router.post(
  '/add-book',
  requireAuth,
  imageUpload.array('images', config.uploads.maxFilesPerRequest),
  verifyImageBytes,
  // After multer, which is what populates req.body for a multipart form. The
  // schema also does the shaping: `category` arrives as an array either way,
  // and `pages` and `price` as numbers.
  validate(userSchemas.addBook),
  async (req: Request<unknown, unknown, AddBookBody>, res: Response) => {
    try {
      /*
       * A seller has to be payable before anything of theirs can sell. Sales
       * are paid by bKash, so a listing without a merchant number would take
       * a buyer's money with nowhere to send the seller's share.
       */
      const seller = await User.findOne(
        { email: String(actingUser(req).email) },
        { bkashMerchant: 1 }
      ).lean();
      if (!seller?.bkashMerchant) {
        res.status(409).json({
          code: 'payout-number-required',
          message:
            'Add your bKash merchant number to your profile first, so we can pay you when your books sell.',
        });
        return;
      }

      // Two ways in. When image hosting is configured the browser has already
      // uploaded to Cloudinary and sends back the URLs; otherwise the files
      // arrive here and are stored inline.
      const uploaded = collectImages(req);

      // A discount from the start is optional, and has to fit the price.
      const discount = {
        type: req.body.discountType ? req.body.discountType : null,
        value: Number(req.body.discountValue ?? 0),
      };
      const problem = discountProblem(Number(req.body.price), discount);
      if (problem) {
        res.status(400).json({ message: problem });
        return;
      }

      const newBook = new AddBook({
        ...req.body,
        discountType: discount.type,
        discountValue: discount.type ? discount.value : 0,
        images: uploaded.images,
        imagePublicIds: uploaded.publicIds,
        // The seller is the signed-in user. Taking this from the body would let
        // anyone publish a listing under someone else's name.
        sellerEmail: actingUser(req).email,
        stock: 1,
      });

      await newBook.save();
      res.status(201).json({ message: 'Book added successfully!', book: newBook });
    } catch (error) {
      log.error({ err: error }, 'AddBook error');
      // Stack traces must never be returned to clients.
      res.status(500).json({ message: 'Failed to add book', error: errorMessage(error) });
    }
  }
);

// ---------------------------------------------------------------------------
// The account's own data
//
// Both are registered before `/:id` below, or Express would read "me" as an id
// and the schema would reject it.
// ---------------------------------------------------------------------------

router.get('/me/export', requireAuth, exportMyData);

router.delete('/me', requireAuth, validate(userSchemas.deleteMe), deleteMyAccount);

router.put('/me/two-factor', requireAuth, validate(userSchemas.twoFactor), setTwoFactor);

router.get('/me/notifications', requireAuth, getNotificationSettings);
router.put('/me/notifications', requireAuth, validate(userSchemas.notifications), updateNotificationSettings);

// ---------------------------------------------------------------------------
// Administrator only
// ---------------------------------------------------------------------------

/**
 * One page of the accounts an administrator may act on.
 *
 * Only the three columns the table draws - name, e-mail and the date joined -
 * for the twenty-five rows on screen: `profilePicture` is a base64 data URI,
 * so whole accounts would carry every user's photograph.
 *
 * Administrators are left out: the table's only action is Delete, and an
 * administrator is not a row you may delete here.
 */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  validate(userSchemas.adminList),
  async (req, res) => {
    const { search, page, pageSize, kind, sort } = validatedQuery<AdminUserQuery>(req);

    const pattern = search ? contains(search) : null;
    // A plain record: the values are regexes, which the generated filter type
    // would have to be widened for anyway.
    //
    // `role: 'user'` rather than `{ $ne: 'admin' }`, although the enum has
    // exactly two values and they select the same accounts. An inequality on
    // the leading field of an index means the fields after it are no longer in
    // order, so the sort becomes a blocking one: `explain()` read all 303 keys
    // and sorted them in memory, where the equality reads 25 and is done.
    const filter: Record<string, unknown> = {
      role: 'user',
      ...(pattern ? { $or: [{ username: pattern }, { email: pattern }] } : {}),
      ...(kind === 'sellers'
        ? { bkashMerchant: { $nin: [null, ''] } }
        : kind === 'buyers'
          ? { bkashMerchant: { $in: [null, ''] } }
          : {}),
    };
    const order = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      nameAZ: { username: 1 },
      nameZA: { username: -1 },
    }[sort] as Record<string, 1 | -1>;

    try {
      const [items, total] = await Promise.all([
        User.find(filter, { username: 1, email: 1, role: 1, createdAt: 1, bkashMerchant: 1 })
          .sort({ ...order, _id: -1 })
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .lean(),
        User.countDocuments(filter),
      ]);

      res.status(200).json({
        items,
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      });
    } catch (error) {
      log.error({ err: error }, 'Error fetching users');
      res.status(500).json({ message: 'Failed to fetch users', error: errorMessage(error) });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(userSchemas.byId),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const { id } = req.params;
      if (id === actingUser(req).id) {
        res.status(400).json({ message: 'You cannot delete your own account' });
        return;
      }

      const user = await User.findByIdAndDelete(id);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }

      await recordAudit(req, {
        action: 'user.delete',
        targetType: 'user',
        targetId: id,
        // The address, because the row has to still make sense once the
        // account it names no longer exists.
        details: { email: user.email, role: user.role },
      });

      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      log.error({ err: error }, 'Error deleting user');
      res.status(500).json({ message: 'Failed to delete user', error: errorMessage(error) });
    }
  }
);

export default router;
