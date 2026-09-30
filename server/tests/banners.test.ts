/**
 * Profile banners: one picture for buying and one for selling, across the top
 * of the profile, where a plain gradient used to be. The profile picture stays
 * one per person.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, PNG_PIXEL } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const EMAIL = 'reader@test.com';

const profileOf = async (auth: string) =>
  (await request.get(`/user/profile?email=${encodeURIComponent(EMAIL)}`).set('Authorization', auth)).body;

describe('profile banners', () => {
  it('stores a buyer banner and a seller banner separately', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });

    const res = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .attach('buyerBanner', PNG_PIXEL, { filename: 'buyer.png', contentType: 'image/png' });
    expect(res.status).toBe(200);

    const profile = await profileOf(auth);
    expect(profile.buyerBanner).toMatch(/^\/api\/user\/reader%40test\.com\/banner\/buyer\?v=\d+$/);
    expect(profile.sellerBanner).toBeNull();
    // Addresses, not the pictures themselves inside the JSON.
    expect(JSON.stringify(profile)).not.toContain('data:image');
  });

  it('serves a banner as an image, to anyone looking at the profile', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });
    await request
      .put('/user/profile')
      .set('Authorization', auth)
      .attach('sellerBanner', PNG_PIXEL, { filename: 'seller.png', contentType: 'image/png' });

    const res = await request.get(`/user/${encodeURIComponent(EMAIL)}/banner/seller`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect((await request.get(`/user/${encodeURIComponent(EMAIL)}/banner/buyer`)).status).toBe(404);
  });

  it('removes a banner when it is sent empty, and leaves the other alone', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });
    await request
      .put('/user/profile')
      .set('Authorization', auth)
      .attach('buyerBanner', PNG_PIXEL, { filename: 'b.png', contentType: 'image/png' })
      .attach('sellerBanner', PNG_PIXEL, { filename: 's.png', contentType: 'image/png' });

    await request.put('/user/profile').set('Authorization', auth).field('buyerBanner', '');

    const profile = await profileOf(auth);
    expect(profile.buyerBanner).toBeNull();
    expect(profile.sellerBanner).not.toBeNull();
  });

  it('refuses a file that is not an image', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });

    const res = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .attach('buyerBanner', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });

    expect(res.status).toBe(415);
  });

  it('still takes a profile picture alongside', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });

    const res = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .attach('profilePicture', PNG_PIXEL, { filename: 'me.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect((await profileOf(auth)).profilePicture).toMatch(/^data:image\/png;base64,/);
  });
});
