import type { AppRelease } from '@shared/api.js';

import { androidReleasesRepo, versionCodeFor } from '../config/android.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('app-release');

/**
 * The newest Android release on GitHub, for the app's update check.
 *
 * Asked here rather than by each phone: GitHub allows 60 unauthenticated
 * requests an hour per address, and many phones in Bangladesh share one
 * address through their carrier. The answer is kept for a quarter of an hour,
 * and a failed lookup keeps serving the last good answer.
 *
 * The API's limit is per address too, and a shared host's address can use it
 * up. When the API says no, the release's own update.json is read instead: a
 * plain download from github.com, with no hourly limit.
 */
const FRESH_MS = 15 * 60 * 1000;
const RETRY_MS = 60 * 1000;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  /** "sha256:<hex>", which GitHub computes for every uploaded asset. */
  digest?: string | null;
}

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

let cached: { release: AppRelease | null; fetchedAt: number } | null = null;
let inFlight: Promise<AppRelease | null> | null = null;

const sha256Of = async (apk: GitHubAsset, assets: GitHubAsset[]): Promise<string | null> => {
  const fromDigest = /^sha256:([0-9a-f]{64})$/i.exec(apk.digest ?? '')?.[1];
  if (fromDigest) return fromDigest.toLowerCase();
  // The release workflow also publishes "<name>.sha256", in sha256sum's format.
  const checksum = assets.find((asset) => asset.name === `${apk.name}.sha256`);
  if (!checksum) return null;
  const res = await fetch(checksum.browser_download_url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  return /^([0-9a-f]{64})\b/i.exec((await res.text()).trim())?.[1]?.toLowerCase() ?? null;
};

/** What the app needs from a release, or null when it has no usable APK. */
export const toAppRelease = async (release: GitHubRelease): Promise<AppRelease | null> => {
  if (release.draft || release.prerelease) return null;
  const versionName = release.tag_name.replace(/^v/, '');
  const versionCode = versionCodeFor(versionName);
  const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
  if (versionCode === null || !apk) return null;
  const sha256 = await sha256Of(apk, release.assets);
  if (!sha256) return null;
  return {
    versionName,
    versionCode,
    apkUrl: apk.browser_download_url,
    apkSize: apk.size,
    sha256,
    notes: (release.body ?? '').slice(0, 4000),
    pageUrl: release.html_url,
    publishedAt: release.published_at,
  };
};

/** What the release workflow publishes as update.json, checked field by field. */
export const fromUpdateFeed = (feed: Record<string, unknown>): AppRelease | null => {
  const { versionName, apkUrl, apkSize, sha256, notes, pageUrl } = feed;
  if (typeof versionName !== 'string' || typeof apkUrl !== 'string' || typeof sha256 !== 'string') return null;
  const versionCode = versionCodeFor(versionName);
  if (versionCode === null || !/^[0-9a-f]{64}$/i.test(sha256) || !apkUrl.startsWith('https://github.com/')) return null;
  return {
    versionName: versionName.replace(/^v/, ''),
    versionCode,
    apkUrl,
    apkSize: typeof apkSize === 'number' && apkSize > 0 ? apkSize : 0,
    sha256: sha256.toLowerCase(),
    notes: typeof notes === 'string' ? notes.slice(0, 4000) : '',
    pageUrl: typeof pageUrl === 'string' ? pageUrl : '',
    publishedAt: null,
  };
};

const fetchFeed = async (): Promise<AppRelease | null> => {
  const res = await fetch(`https://github.com/${androidReleasesRepo()}/releases/latest/download/update.json`, {
    headers: { 'User-Agent': 'BookStoreBD' },
    signal: AbortSignal.timeout(5000),
  });
  // Releases from before the feed existed have none.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`The release feed answered ${res.status}`);
  return fromUpdateFeed((await res.json()) as Record<string, unknown>);
};

const fetchLatest = async (): Promise<AppRelease | null> => {
  const res = await fetch(`https://api.github.com/repos/${androidReleasesRepo()}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BookStoreBD' },
    signal: AbortSignal.timeout(5000),
  }).catch((error: unknown) => {
    log.warn({ err: error }, 'GitHub API unreachable; reading the release feed');
    return null;
  });
  // No release yet is an answer, not a failure.
  if (res?.status === 404) return null;
  if (res?.ok) return toAppRelease((await res.json()) as GitHubRelease);
  if (res) log.warn({ status: res.status }, 'GitHub API refused; reading the release feed');
  return fetchFeed();
};

/** The latest release, from the cache when it is fresh enough. Never throws. */
export const latestAppRelease = async (now: number = Date.now()): Promise<AppRelease | null> => {
  if (cached && now - cached.fetchedAt < FRESH_MS) return cached.release;
  inFlight ??= fetchLatest()
    .then((release) => {
      cached = { release, fetchedAt: Date.now() };
      return release;
    })
    .catch((error: unknown) => {
      log.warn({ err: error }, 'Could not check the latest Android release');
      // Try again in a minute rather than on every request, and keep what we had.
      cached = { release: cached?.release ?? null, fetchedAt: Date.now() - FRESH_MS + RETRY_MS };
      return cached.release;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

/** A test seam: forgets the cached answer. */
export const resetAppReleaseCache = (): void => {
  cached = null;
  inFlight = null;
};
