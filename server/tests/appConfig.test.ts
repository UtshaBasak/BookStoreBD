/**
 * GET /api/v1/app/config, and the update check behind it: the newest APK on
 * GitHub Releases, asked for by this server so phones never meet GitHub's
 * per-address limit. GitHub is stood in for.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { latestAppRelease, resetAppReleaseCache, toAppRelease } from '../utils/appRelease.js';
import { versionCodeFor } from '../config/android.js';
import { CATEGORY_GROUPS, DELIVERY_DIVISIONS } from '../config/reference.js';
import { DELIVERY, RETURN_WINDOW_DAYS } from '../config/commerce.js';
import { advertisedPromotions, type Promotion } from '../config/promotions.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(async () => {
  await clearDatabase();
  resetAppReleaseCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.ANDROID_MIN_VERSION_CODE;
});

const SHA = 'a'.repeat(64);

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v1.2.3',
  name: 'BookStoreBD 1.2.3',
  body: 'Faster search.',
  html_url: 'https://github.com/UtshaBasak/BookStoreBD-Android/releases/tag/v1.2.3',
  published_at: '2026-10-01T10:00:00Z',
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'BookStoreBD-1.2.3.apk',
      browser_download_url: 'https://github.com/UtshaBasak/BookStoreBD-Android/releases/download/v1.2.3/BookStoreBD-1.2.3.apk',
      size: 4_000_000,
      digest: `sha256:${SHA}`,
    },
  ],
  ...overrides,
});

const realFetch = globalThis.fetch;
/** GitHub's answers, by URL prefix; everything else goes out as normal. */
const github = (answer: (url: string) => Response | Promise<Response>) => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const { origin } = new URL(url);
      if (origin !== 'https://api.github.com' && origin !== 'https://github.com') return realFetch(input, init);
      calls.push(url);
      return Promise.resolve(answer(url));
    })
  );
  return calls;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('version codes', () => {
  it('follow the build: 1.2.3 is 10203', () => {
    expect(versionCodeFor('1.2.3')).toBe(10203);
    expect(versionCodeFor('v0.1.0')).toBe(100);
    expect(versionCodeFor('10.0.0')).toBe(100000);
  });

  it('are null for anything the build would not produce', () => {
    expect(versionCodeFor('1.2')).toBeNull();
    expect(versionCodeFor('1.2.3-beta')).toBeNull();
    expect(versionCodeFor('1.100.0')).toBeNull();
  });
});

describe('the app configuration', () => {
  it('carries the shop lists and rules the app needs', async () => {
    github(() => json({}, 404));
    const res = await request.get('/api/v1/app/config');

    expect(res.status).toBe(200);
    expect(res.body.shop.delivery).toMatchObject(DELIVERY);
    expect(res.body.shop.returnWindowDays).toBe(RETURN_WINDOW_DAYS);
    expect(res.body.shop.categories).toEqual(CATEGORY_GROUPS);
    expect(res.body.shop.divisions).toEqual(Object.entries(DELIVERY_DIVISIONS).map(([name, districts]) => ({ name, districts })));
    expect(res.body.links.privacy).toMatch(/\/privacy$/);
    expect(res.body.android).toEqual({ minVersionCode: 0, latest: null });
  });

  it('says how to reach the shop and where its information pages are', async () => {
    const res = await request.get('/api/v1/app/config');

    expect(res.body.contact).toEqual({ email: 'support.utsha@gmail.com', location: 'Dhaka, Bangladesh' });
    expect(res.body.links.about).toMatch(/\/about$/);
    expect(res.body.links.contact).toMatch(/\/contact$/);
  });

  it('names the codes checkout tells shoppers about', async () => {
    const res = await request.get('/api/v1/app/config');

    expect(res.body.shop.promotions.firstOrder).toEqual({ code: 'BookStoreBD', description: '50 Tk off your first order' });
    expect(res.body.shop.promotions.freeDelivery).toEqual({
      code: 'FreeDelivery',
      description: 'Free delivery on orders of 1000 Tk or more',
      minBooksTotal: 1000,
    });
  });

  it('leaves out codes that are not running', () => {
    const ended: Promotion[] = [
      {
        code: 'OLD',
        description: 'Gone',
        discount: { kind: 'free-delivery' },
        minBooksTotal: 500,
        endsAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];

    expect(advertisedPromotions(new Date('2026-10-12T00:00:00Z'), ended)).toEqual({ firstOrder: null, freeDelivery: null });
  });

  it('offers the bot check and Google only when they are set up', async () => {
    github(() => json({}, 404));
    const off = (await request.get('/api/v1/app/config')).body;
    expect(off.auth).toEqual({ captchaSiteKey: null, challengeUrl: null, google: false, googleClientId: null });

    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    process.env.GOOGLE_CLIENT_ID = 'web-client.apps.googleusercontent.com';
    const on = (await request.get('/api/v1/app/config')).body;
    expect(on.auth.captchaSiteKey).toBe('site-key');
    expect(on.auth.challengeUrl).toMatch(/\/app\/challenge$/);
    expect(on.auth).toMatchObject({ google: true, googleClientId: 'web-client.apps.googleusercontent.com' });
  });

  it('includes the newest release, with its checksum', async () => {
    github(() => json(release()));
    const { body } = await request.get('/api/v1/app/config');

    expect(body.android.latest).toEqual({
      versionName: '1.2.3',
      versionCode: 10203,
      apkUrl: 'https://github.com/UtshaBasak/BookStoreBD-Android/releases/download/v1.2.3/BookStoreBD-1.2.3.apk',
      apkSize: 4_000_000,
      sha256: SHA,
      notes: 'Faster search.',
      pageUrl: 'https://github.com/UtshaBasak/BookStoreBD-Android/releases/tag/v1.2.3',
      publishedAt: '2026-10-01T10:00:00Z',
    });
  });

  it('reports the oldest supported build', async () => {
    github(() => json({}, 404));
    process.env.ANDROID_MIN_VERSION_CODE = '10200';
    expect((await request.get('/api/v1/app/config')).body.android.minVersionCode).toBe(10200);
  });
});

describe('the release lookup', () => {
  it('asks GitHub at most once a quarter of an hour', async () => {
    const calls = github(() => json(release()));
    await latestAppRelease();
    await latestAppRelease();
    await latestAppRelease(Date.now() + 10 * 60 * 1000);
    expect(calls).toHaveLength(1);
    await latestAppRelease(Date.now() + 16 * 60 * 1000);
    expect(calls).toHaveLength(2);
  });

  it('keeps the last good answer when GitHub is unreachable', async () => {
    github(() => json(release()));
    expect((await latestAppRelease())?.versionName).toBe('1.2.3');

    github(() => {
      throw new Error('network down');
    });
    expect((await latestAppRelease(Date.now() + 16 * 60 * 1000))?.versionName).toBe('1.2.3');
  });

  it('reads the checksum file when GitHub gives no digest', async () => {
    const asset = release().assets[0];
    github((url) =>
      url.endsWith('.sha256')
        ? new Response(`${'b'.repeat(64)}  BookStoreBD-1.2.3.apk\n`)
        : json(
            release({
              assets: [
                { ...asset, digest: null },
                { name: 'BookStoreBD-1.2.3.apk.sha256', browser_download_url: `${asset.browser_download_url}.sha256`, size: 90 },
              ],
            })
          )
    );
    expect((await latestAppRelease())?.sha256).toBe('b'.repeat(64));
  });

  it('ignores drafts, pre-releases, odd tags and releases without a verifiable APK', async () => {
    expect(await toAppRelease(release({ draft: true }))).toBeNull();
    expect(await toAppRelease(release({ prerelease: true }))).toBeNull();
    expect(await toAppRelease(release({ tag_name: 'nightly' }))).toBeNull();
    expect(await toAppRelease(release({ assets: [] }))).toBeNull();
    const asset = release().assets[0];
    expect(await toAppRelease(release({ assets: [{ ...asset, digest: null }] }))).toBeNull();
  });
});
