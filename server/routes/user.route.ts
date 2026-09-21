import express, { type Request, type Response } from 'express';

import { signup, signin } from '../controllers/auth.controller.js';
import {
  getUserProfile,
  updateUserProfile,
  uploadDescriptionImages,
} from '../controllers/user.controller.js';
import { deleteMyAccount, exportMyData } from '../controllers/account.controller.js';
import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';
import { config } from '../config/env.js';
import { actingUser, requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { imageUpload, verifyImageBytes } from '../middleware/imageUpload.js';
import { recordAudit } from '../utils/audit.js';
import { isOwnedCloudinaryUrl } from '../config/cloudinary.js';
import { createLogger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import { validate } from '../middleware/validate.js';
import {
  authSchemas,
  userSchemas,
  type AddBookBody,
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
const collectHostedImages = (body: AddBookBody) => {
  const urls = (body.images ?? []).filter(isOwnedCloudinaryUrl);
  const ids = (body.imagePublicIds ?? []).filter((id) => id.length > 0);

  return { images: urls, publicIds: urls.length ? ids.slice(0, urls.length) : [] };
};


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
      const hosted = collectHostedImages(req.body);
      const files = Array.isArray(req.files) ? req.files : [];
      const inline = files.map(
        (file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      );

      const newBook = new AddBook({
        ...req.body,
        images: hosted.images.length ? hosted.images : inline,
        imagePublicIds: hosted.publicIds,
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

router.post(
  '/upload-images',
  requireAuth,
  imageUpload.array('images', config.uploads.maxFilesPerRequest),
  verifyImageBytes,
  uploadDescriptionImages
);

// ---------------------------------------------------------------------------
// Administrator only
// ---------------------------------------------------------------------------

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json(users);
  } catch (error) {
    log.error({ err: error }, 'Error fetching users');
    res.status(500).json({ message: 'Failed to fetch users', error: errorMessage(error) });
  }
});

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
