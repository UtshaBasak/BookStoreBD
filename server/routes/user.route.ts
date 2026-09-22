import express, { type Request, type Response } from 'express';

import { signup, signin } from '../controllers/auth.controller.js';
import {
  getUserProfile,
  updateUserProfile,
} from '../controllers/user.controller.js';
import { deleteMyAccount, exportMyData } from '../controllers/account.controller.js';
import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';
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
 * Stored on the account as a base64 data URI, so anything that listed people
 * carried their photographs with it. Public, like the profile endpoint that
 * used to return the same bytes inline, and cacheable - which a data URI in a
 * JSON body never was.
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

// ---------------------------------------------------------------------------
// Authenticated
// ---------------------------------------------------------------------------

router.put(
  '/profile',
  requireAuth,
  imageUpload.single('profilePicture'),
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
  // schema also does the shaping the handler used to do by hand: `category`
  // arrives as an array either way, and `pages` and `price` as numbers.
  validate(userSchemas.addBook),
  async (req: Request<unknown, unknown, AddBookBody>, res: Response) => {
    try {
      // Two ways in. When image hosting is configured the browser has already
      // uploaded to Cloudinary and sends back the URLs; otherwise the files
      // arrive here and are stored inline as before.
      const uploaded = collectImages(req);

      const newBook = new AddBook({
        ...req.body,
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

// ---------------------------------------------------------------------------
// Administrator only
// ---------------------------------------------------------------------------

/**
 * One page of the accounts an administrator may act on.
 *
 * This used to answer with every account, `select('-password')` - which means
 * every field except the password, and `profilePicture` is stored as a base64
 * data URI. So the response carried every photograph of every user, to draw a
 * table of three columns: name, e-mail, and the date they joined. Those three
 * are what it sends now, for the twenty-five rows on screen.
 *
 * Administrators are left out, as they always were: the table's only action is
 * Delete, and an administrator is not a row you may delete here.
 */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  validate(userSchemas.adminList),
  async (req, res) => {
    const { search, page, pageSize } = validatedQuery<AdminUserQuery>(req);

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
    };

    try {
      const [items, total] = await Promise.all([
        User.find(filter, { username: 1, email: 1, role: 1, createdAt: 1 })
          .sort({ createdAt: -1, _id: -1 })
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
