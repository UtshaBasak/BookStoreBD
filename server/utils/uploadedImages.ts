import type { Request } from 'express';

import { isOwnedCloudinaryUrl } from '../config/cloudinary.js';

/** Whatever a multipart form may carry alongside its files. */
interface HostedFields {
  images?: string[];
  imagePublicIds?: string[];
}

/** Only the two parts of a request this reads, so any handler's shape fits. */
type RequestWithImages = Pick<Request, 'files'> & { body?: unknown };

export interface CollectedImages {
  images: string[];
  publicIds: string[];
}

/**
 * The images a request is storing, whichever way they arrived.
 *
 * Two ways in. With image hosting configured the browser uploads to Cloudinary
 * itself and sends back the URLs; without it the files arrive here and are
 * kept as base64 on the document, exactly as they were before hosting existed.
 *
 * A URL is only accepted when it is a delivery URL for *this* Cloudinary
 * account. The client sends back what it received, so without that check a
 * caller could store any URL they liked - an image pointing anywhere, chosen
 * by them, rendered to whoever opens the record.
 */
export const collectImages = (req: RequestWithImages): CollectedImages => {
  const body = (req.body ?? {}) as HostedFields;

  const urls = (body.images ?? []).filter(isOwnedCloudinaryUrl);
  if (urls.length) {
    const ids = (body.imagePublicIds ?? []).filter((id) => id.length > 0);
    return { images: urls, publicIds: ids.slice(0, urls.length) };
  }

  const files = Array.isArray(req.files) ? req.files : [];
  return {
    images: files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`),
    publicIds: [],
  };
};

export default collectImages;
