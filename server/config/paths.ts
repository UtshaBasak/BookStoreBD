import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Filesystem locations the server needs, resolved once.
 *
 * These cannot simply hang off `import.meta.url`. In development the modules
 * run from `server/`, but after `npm run build` they run from `server/dist/`,
 * so anything resolved relative to the module would land a directory deep in
 * production: the uploads directory and the client bundle would both quietly
 * go missing. Walking up to the nearest package.json gives the same answer
 * either way.
 */
const findPackageRoot = (start: string): string => {
  let dir = start;

  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    // Reached the filesystem root without finding one; fall back rather than
    // loop, so a missing package.json is a wrong path and not a hang.
    if (parent === dir) return start;
    dir = parent;
  }

  return dir;
};

/** The `server` package directory, whether running from source or from dist. */
export const SERVER_ROOT = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

/**
 * Legacy cover images that were written to disk before covers moved onto the
 * document, and then to Cloudinary. Still served so old records keep rendering.
 */
export const UPLOADS_DIR = join(SERVER_ROOT, 'uploads');

/** The built client, served from here when SERVE_CLIENT is on. */
export const CLIENT_DIST = resolve(SERVER_ROOT, '..', 'client', 'dist');
