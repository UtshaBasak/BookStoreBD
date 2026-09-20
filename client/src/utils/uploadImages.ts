import type { UploadSignature } from '@shared/api.js';

import { apiFetch, apiUrl } from '../config/api.js';

export interface UploadProgress {
  completed: number;
  total: number;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
}

/** Hosting is configured and the files are now Cloudinary URLs. */
export interface HostedUpload {
  hosted: true;
  images: string[];
  publicIds: string[];
}

/** Hosting is not configured; the caller falls back to posting to the API. */
export interface UnhostedUpload {
  hosted: false;
}

export type UploadResult = HostedUpload | UnhostedUpload;

/**
 * Uploads images straight from the browser to Cloudinary.
 *
 * The API only signs the request; the bytes go directly to Cloudinary, so a
 * ten-image upload never occupies the server's memory or request budget.
 *
 * Returns `{ hosted: true, images, publicIds }` when hosting is configured, or
 * `{ hosted: false }` when it is not — in which case the caller falls back to
 * posting the files to the API as before.
 */
export const uploadImages = async (
  files: ArrayLike<File> | null | undefined,
  { onProgress }: UploadOptions = {}
): Promise<UploadResult> => {
  const list = Array.from(files ?? []);
  if (!list.length) return { hosted: true, images: [], publicIds: [] };

  const signatureRes = await apiFetch(apiUrl('/upload/signature'));

  // 503 means image hosting is not configured; anything else is a real failure.
  if (signatureRes.status === 503) return { hosted: false };
  if (!signatureRes.ok) throw new Error('Could not start the upload');

  const { signature, timestamp, folder, apiKey, uploadUrl } =
    (await signatureRes.json()) as UploadSignature;

  const images: string[] = [];
  const publicIds: string[] = [];

  for (const [index, file] of list.entries()) {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    form.append('folder', folder);

    // Deliberately plain fetch, not apiFetch: this request goes to Cloudinary,
    // and the session token has no business being sent to a third party.
    const res = await fetch(uploadUrl, { method: 'POST', body: form });

    if (!res.ok) {
      throw new Error(`Upload failed for ${file.name || 'image'}`);
    }

    const result = (await res.json()) as { secure_url: string; public_id: string };
    images.push(result.secure_url);
    publicIds.push(result.public_id);

    onProgress?.({ completed: index + 1, total: list.length });
  }

  return { hosted: true, images, publicIds };
};

export default uploadImages;
