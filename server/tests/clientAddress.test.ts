/**
 * The rate limits count visitors, not Render's proxies.
 *
 * Behind Render a request crosses more than one proxy, each on a private
 * address. Trusting only one hop would make req.ip the next proxy along and
 * put the whole site in a handful of rate-limit buckets.
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

  it('is found behind Cloudflare too, as Render delivers every request', async () => {
    // As production sees it: a Cloudflare edge, then Render's proxies.
    const agent = await freshApp();
    await exhaust(agent, via('198.51.100.1', '172.71.124.150', '10.30.119.5'));

    const same = await agent
      .get('/robots.txt')
      .set('X-Forwarded-For', via('198.51.100.1', '162.158.88.65', '10.25.98.2'));
    // Somebody else, through the very same Cloudflare edge.
    const other = await agent
      .get('/robots.txt')
      .set('X-Forwarded-For', via('198.51.100.2', '172.71.124.150', '10.30.119.5'));

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
