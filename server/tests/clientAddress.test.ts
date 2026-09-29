/**
 * The rate limits count visitors, not Render's proxies.
 *
 * Behind Render a request crosses more than one proxy, each on a private
 * address. Trusting "one hop" made req.ip the next proxy along - the live log
 * showed 10.30.119.5, 10.25.98.2 and 10.28.29.130 for every request - so the
 * whole site shared three rate-limit buckets.
 *
 * Driven through the robots.txt limiter (120 per window), which needs no
 * database. No database here; createApp() only assembles middleware.
 */
import supertest from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const freshApp = async () => {
  vi.resetModules();
  const { createApp } = await import('../app.js');
  return supertest(createApp());
};

afterEach(() => {
  vi.resetModules();
});

/** A request as Render delivers it: the visitor, then its proxies. */
const via = (visitor: string, ...proxies: string[]) => [visitor, ...proxies].join(', ');

type Agent = Awaited<ReturnType<typeof freshApp>>;

const exhaust = async (agent: Agent, forwardedFor: string) => {
  for (let i = 0; i < 120; i += 1) {
    await agent.get('/robots.txt').set('X-Forwarded-For', forwardedFor);
  }
};

describe('a visitor behind several proxies', () => {
  it('has a limit of their own, not one shared with everyone behind the same proxy', async () => {
    const agent = await freshApp();
    await exhaust(agent, via('198.51.100.1', '10.30.119.5', '10.25.98.2'));

    const same = await agent.get('/robots.txt').set('X-Forwarded-For', via('198.51.100.1', '10.30.119.5'));
    // Somebody else, arriving through the very same proxies.
    const other = await agent.get('/robots.txt').set('X-Forwarded-For', via('198.51.100.2', '10.30.119.5', '10.25.98.2'));

    expect(same.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it('cannot escape it by writing another address into the header', async () => {
    const agent = await freshApp();
    await exhaust(agent, via('198.51.100.1', '10.30.119.5'));

    // The client puts 203.0.113.9 first; the proxy appends the real address.
    const spoofed = await agent
      .get('/robots.txt')
      .set('X-Forwarded-For', via('203.0.113.9', '198.51.100.1', '10.30.119.5'));

    expect(spoofed.status).toBe(429);
  });
});
