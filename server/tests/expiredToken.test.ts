/**
 * An expired token on a page that also works signed out.
 *
 * It was quietly treated as no token, so the owner of a profile, back after
 * the fifteen-minute access token had lapsed, got the public version of their
 * own page - no address, phone or bKash number - and nothing told the browser
 * to refresh the session. It is a 401 now, which does.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createUser } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const EXPIRED = 'Bearer expired.access.token';

describe('a page that works signed in or out', () => {
  it('is answered anonymously when no token is sent', async () => {
    await createUser({ email: 'seller@test.com' });

    const res = await request.get('/user/profile?email=seller%40test.com');

    expect(res.status).toBe(200);
    expect(res.body.phone).toBeUndefined();
  });

  it('asks for a refresh when the token sent is no good, rather than answering as a stranger', async () => {
    await createUser({ email: 'seller@test.com' });

    const res = await request.get('/user/profile?email=seller%40test.com').set('Authorization', EXPIRED);

    expect(res.status).toBe(401);
  });
});

describe('a browser error report', () => {
  it('is still accepted with an expired token: it is sent once, and must not be lost', async () => {
    const res = await request
      .post('/client-error')
      .set('Authorization', EXPIRED)
      .send({ context: 'Checkout', message: 'Something broke' });

    expect(res.status).toBeLessThan(300);
  });
});
