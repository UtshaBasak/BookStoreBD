/**
 * Kept in its own file because the limiter counts per process. Exhausting the
 * auth bucket here would make sign-in fail for any other test sharing the
 * module registry.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createTestContext, closeTestContext } from './helpers/testApp.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);

describe('rate limiting', () => {
  it('advertises the limit on a normal response', async () => {
    const res = await request.get('/book');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit'] ?? res.headers.ratelimit).toBeDefined();
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
