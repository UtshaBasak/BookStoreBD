/**
 * Kept in its own file because the limiter counts per process. Exhausting the
 * auth bucket here would make sign-in fail for any other test sharing the
 * module registry.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createTestContext, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);

describe('rate limiting', () => {
  it('advertises the limit on a normal response', async () => {
    const res = await request.get('/filter/booklist');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit'] ?? res.headers.ratelimit).toBeDefined();
  });

  it('covers the crawler endpoints, which sit in front of the general limiter', async () => {
    // They are before `apiLimiter` on purpose - a search engine asking for a
    // sitemap is not the traffic it exists to stop - but the sitemap reads the
    // catalogue, so with no ceiling at all it is an unauthenticated database
    // query anyone can repeat as fast as they like.
    for (const path of ['/sitemap.xml', '/robots.txt']) {
      const res = await request.get(path);

      expect(res.status).toBe(200);
      // draft-7 sends one combined `RateLimit` header rather than three.
      const advertised = res.headers['ratelimit-limit'] ?? res.headers.ratelimit;
      expect(advertised).toMatch(/120/);
    }
  });

  it('returns 429 once the auth bucket is exhausted', async () => {
    const attempts = [];
    // The auth ceiling is 50 per window; 60 guarantees it is crossed.
    for (let i = 0; i < 60; i += 1) {
      attempts.push(
        await request.post('/auth/signin').send({ email: `nobody${i}@test.com`, password: 'x' })
      );
    }

    const limited = attempts.filter((r) => r.status === 429);

    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0].body.message).toMatch(/too many requests/i);
  });

  it('does not rate limit the health check', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
  });
});
