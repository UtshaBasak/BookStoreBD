/**
 * What went wrong in somebody's browser.
 *
 * `reportError` wrote to the console in development and did nothing at all in
 * a build, so a page that broke for a real visitor broke silently: the only
 * person who ever saw it was the person it happened to, and they are not the
 * one who can fix it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const report = {
  context: 'Uncaught error',
  message: "Cannot read properties of undefined (reading 'title')",
  stack: 'at BookView (/assets/BookView-Ct2n68UR.js:1:2345)',
  url: 'https://example.test/book/abc',
  userAgent: 'Mozilla/5.0',
};

describe('a report from a browser', () => {
  it('is accepted, with nothing to say back', async () => {
    const res = await request.post('/client-error').send(report);

    // 204: the browser has nothing to do with the answer, and a body would be
    // one more thing to go wrong while reporting that something went wrong.
    expect(res.status).toBe(204);
  });

  it('is accepted from somebody signed out, because pages break for them too', async () => {
    expect((await request.post('/client-error').send(report)).status).toBe(204);
  });

  it('and from somebody signed in, who can then be named in the log', async () => {
    const { auth } = await createSignedInUser(request, { email: 'shopper@test.com' });

    expect(
      (await request.post('/client-error').set('Authorization', auth).send(report)).status
    ).toBe(204);
  });
});

describe('what it refuses', () => {
  it('a report with nothing in it', async () => {
    expect((await request.post('/client-error').send({})).status).toBe(400);
  });

  it('an empty message', async () => {
    expect(
      (await request.post('/client-error').send({ ...report, message: '' })).status
    ).toBe(400);
  });

  it('a stack trace long enough to be an attack', async () => {
    // Unauthenticated and it writes a log line, so every field is bounded.
    const res = await request
      .post('/client-error')
      .send({ ...report, stack: 'x'.repeat(50_000) });

    expect(res.status).toBe(400);
  });

  it('an operator object where a string belongs', async () => {
    const res = await request
      .post('/client-error')
      .send({ ...report, message: { $ne: null } });

    expect(res.status).toBe(400);
  });

  it('and it advertises a limit, because it is open to anyone', async () => {
    const res = await request.post('/client-error').send(report);

    const advertised = res.headers['ratelimit-limit'] ?? res.headers.ratelimit;
    expect(advertised).toMatch(/60/);
  });
});
