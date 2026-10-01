/**
 * The deployed site may always call its own API.
 *
 * Browsers send an Origin header on a same-origin POST as well as a
 * cross-origin one, so even with CORS_ORIGINS unset a single-service
 * deployment must allow its own address, or it would refuse every sign-in,
 * order and form submitted from its own pages.
 *
 * No database here; createApp() only assembles middleware.
 */
import supertest from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SITE = 'https://bookstorebd.onrender.com';

const appWith = async (env: Record<string, string>) => {
  Object.assign(process.env, env);
  vi.resetModules();
  const { createApp } = await import('../app.js');
  return supertest(createApp());
};

afterEach(() => {
  delete process.env.RENDER_EXTERNAL_URL;
  delete process.env.PUBLIC_SITE_URL;
  delete process.env.CORS_ORIGINS;
  vi.resetModules();
});

describe('the origins allowed to call the API', () => {
  it("include Render's address for the service, with nothing configured", async () => {
    const agent = await appWith({ RENDER_EXTERNAL_URL: SITE });

    const res = await agent.get('/health').set('Origin', SITE);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(SITE);
  });

  it('include a custom domain given as PUBLIC_SITE_URL', async () => {
    const agent = await appWith({ PUBLIC_SITE_URL: 'https://bookstorebd.com/' });

    const res = await agent.get('/health').set('Origin', 'https://bookstorebd.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://bookstorebd.com');
  });

  it('keep what CORS_ORIGINS lists alongside them', async () => {
    const agent = await appWith({ RENDER_EXTERNAL_URL: SITE, CORS_ORIGINS: 'https://admin.example.com' });

    const listed = await agent.get('/health').set('Origin', 'https://admin.example.com');
    const own = await agent.get('/health').set('Origin', SITE);

    expect(listed.headers['access-control-allow-origin']).toBe('https://admin.example.com');
    expect(own.headers['access-control-allow-origin']).toBe(SITE);
  });

  it('still refuse anybody else', async () => {
    const agent = await appWith({ RENDER_EXTERNAL_URL: SITE });

    const res = await agent.get('/health').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    // Refused, not a server fault: a 500 here would be logged and reported as one.
    expect(res.status).toBe(403);
  });
});
