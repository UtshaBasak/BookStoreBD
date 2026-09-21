import type { RequestHandler } from 'express';
import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';

import { config } from '../config/env.js';
import { errorHandler } from '../utils/error.js';

/** What a book cover, a profile picture or a chat attachment may be. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
  bytes.every((byte, index) => buffer[index] === byte);

/**
 * What a file actually is, read from its first bytes.
 *
 * The browser's `Content-Type` is whatever the client chose to send, so a text
 * file called `cover.png` arrives claiming to be an image. These signatures are
 * part of the formats themselves and cannot be renamed away.
 */
export const sniffImageType = (buffer: Buffer): string | null => {
  if (buffer.length < 12) return null;

  // 89 P N G \r \n 0x1a \n
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // Start of Image, then any JFIF/EXIF marker.
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // "GIF87a" or "GIF89a".
  if (buffer.subarray(0, 6).toString('latin1').match(/^GIF8[79]a$/)) return 'image/gif';
  // A RIFF container whose form type is WEBP.
  if (
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
};

/**
 * Rejects on the declared type before anything is read.
 *
 * Cheap, and it stops a 5 MB video before it is buffered - but it trusts the
 * client, so `verifyImageBytes` below checks what actually arrived.
 */
const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(errorHandler(415, 'Only PNG, JPEG, WebP and GIF images can be uploaded'));
};

/** Images in memory, to be stored as base64 or forwarded to image hosting. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileSizeBytes,
    files: config.uploads.maxFilesPerRequest,
  },
  fileFilter,
});

/**
 * Checks that every uploaded file is the image it said it was, and corrects the
 * recorded type to what the bytes say.
 *
 * Runs after multer, because the declared type is all that is known before the
 * file is read. The correction matters: the handlers build a
 * `data:<mimetype>;base64,...` URI, so a mislabelled file would be stored with
 * a lie attached to it.
 */
export const verifyImageBytes: RequestHandler = (req, res, next) => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...(Array.isArray(req.files) ? req.files : []),
  ];

  for (const file of files) {
    const actual = sniffImageType(file.buffer);
    if (!actual) {
      next(errorHandler(415, `${file.originalname} is not a PNG, JPEG, WebP or GIF image`));
      return;
    }
    file.mimetype = actual;
  }

  next();
};

export default imageUpload;
