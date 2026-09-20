import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';

import type { UploadSignature } from '@shared/api.js';

import { config } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('cloudinary');

/**
 * Image hosting is optional. With no credentials configured the app keeps
 * storing covers as base64 on the document, exactly as it did before, so a
 * fresh clone runs without anyone signing up for anything.
 */
export const isCloudinaryConfigured = (): boolean =>
  Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * The three credentials, or an error.
 *
 * Every caller already guards on isCloudinaryConfigured(); going through this
 * is what lets the compiler agree they are strings rather than leaving three
 * non-null assertions at each use.
 */
const credentials = (): CloudinaryCredentials => {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured; check isCloudinaryConfigured() first');
  }

  return { cloudName, apiKey, apiSecret };
};

let configured = false;

const ensureConfigured = (): CloudinaryCredentials => {
  const creds = credentials();

  if (!configured) {
    cloudinary.config({
      cloud_name: creds.cloudName,
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      secure: true,
    });
    configured = true;
  }

  return creds;
};

/** Where uploads land, so the account stays tidy and is easy to clear down. */
export const UPLOAD_FOLDER = 'bookstorebd/books';

/**
 * Signs an upload so the browser can send the file straight to Cloudinary.
 *
 * The bytes never pass through this API: it only vouches for the request. The
 * signature covers a timestamp, so it cannot be replayed indefinitely.
 *
 * Signing is delegated to the SDK rather than hand-rolled. The documented rule
 * is "sorted params, secret appended, then hash", but the docs do not say which
 * hash — it is SHA-1 — and that is exactly the kind of detail worth not
 * guessing at.
 */
export const createUploadSignature = ({ folder = UPLOAD_FOLDER } = {}): UploadSignature => {
  const { cloudName, apiKey, apiSecret } = ensureConfigured();

  const timestamp = Math.round(Date.now() / 1000);
  const params = { folder, timestamp };

  return {
    signature: cloudinary.utils.api_sign_request(params, apiSecret),
    timestamp,
    folder,
    apiKey,
    cloudName,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  };
};

/**
 * True when a URL is an image delivered by *this* Cloudinary account.
 *
 * The client sends back the URL it received, so without this check a caller
 * could store any URL they liked on a listing — an image pointing anywhere,
 * chosen by them, rendered to every visitor.
 */
export const isOwnedCloudinaryUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !config.cloudinary.cloudName) return false;
  return value.startsWith(`https://res.cloudinary.com/${config.cloudinary.cloudName}/`);
};

/** Removes assets by public id. Never throws — a failed cleanup is logged. */
export const destroyAssets = async (publicIds: readonly unknown[] = []): Promise<number> => {
  const ids = publicIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (!ids.length || !isCloudinaryConfigured()) return 0;

  ensureConfigured();

  let removed = 0;
  for (const publicId of ids) {
    try {
      await cloudinary.uploader.destroy(publicId);
      removed += 1;
    } catch (error) {
      log.warn({ err: error, publicId }, 'Failed to remove Cloudinary asset');
    }
  }
  return removed;
};

/** Uploads a data URI or local path. Used by the migration script. */
export const uploadImage = async (
  source: string,
  options: UploadApiOptions = {}
): Promise<UploadApiResponse> => {
  ensureConfigured();
  return cloudinary.uploader.upload(source, { folder: UPLOAD_FOLDER, ...options });
};

export default cloudinary;
