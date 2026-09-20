import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

import { apiFetch, apiUrl, API_BASE_URL } from './api.js';
import { setSession, getToken } from '../utils/auth.js';

/**
 * The headers apiFetch built for a call.
 *
 * `RequestInit.headers` can be any of three shapes, but apiFetch always passes
 * a Headers instance - that is the thing under test - so the assertions read it
 * as one rather than repeating the narrowing at every call site.
 */
const headersOf = (init: RequestInit | undefined): Headers => init?.headers as Headers;

const respond = (status = 200, body = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let assign: Mock;

beforeEach(() => {
  assign = vi.fn();
  // jsdom refuses a real navigation, so the redirect target is stubbed.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/cart', assign },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiUrl', () => {
  it('joins a root-relative path to the base URL', () => {
    expect(apiUrl('/book')).toBe(`${API_BASE_URL}/book`);
  });

  it('tolerates a path without a leading slash', () => {
    expect(apiUrl('book')).toBe(`${API_BASE_URL}/book`);
  });

  it('never produces a double slash', () => {
    expect(apiUrl('/book')).not.toMatch(/[^:]\/\//);
  });
});

describe('apiFetch', () => {
  it('sends no Authorization header when signed out', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond());

    await apiFetch(`${API_BASE_URL}/book`);

    const headers = headersOf(fetchMock.mock.calls[0][1]);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches the bearer token when signed in', async () => {
    setSession({ token: 'abc123', user: { email: 'a@test.com', role: 'user' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond());

    await apiFetch(`${API_BASE_URL}/cart`);

    const headers = headersOf(fetchMock.mock.calls[0][1]);
    expect(headers.get('Authorization')).toBe('Bearer abc123');
  });

  it('preserves headers the caller supplied', async () => {
    setSession({ token: 'abc123', user: { email: 'a@test.com', role: 'user' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond());

    await apiFetch(`${API_BASE_URL}/cart/add/1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(headersOf(init).get('Content-Type')).toBe('application/json');
    expect(headersOf(init).get('Authorization')).toBe('Bearer abc123');
    expect(init?.method).toBe('POST');
  });

  it('does not overwrite an Authorization header set by the caller', async () => {
    setSession({ token: 'abc123', user: { email: 'a@test.com', role: 'user' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond());

    await apiFetch(`${API_BASE_URL}/cart`, { headers: { Authorization: 'Bearer explicit' } });

    expect(headersOf(fetchMock.mock.calls[0][1]).get('Authorization')).toBe('Bearer explicit');
  });

  it('clears the session and redirects when a refresh also fails', async () => {
    setSession({ token: 'expired', user: { email: 'a@test.com', role: 'user' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(401, { message: 'Authentication required' }));

    const res = await apiFetch(`${API_BASE_URL}/cart`);

    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith('/sign-in');
  });

  it('refreshes once on a 401 and retries the original request', async () => {
    setSession({ token: 'expired', user: { email: 'a@test.com', role: 'user' } });

    const calls: Array<{ url: string; auth: string | null }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      calls.push({ url: String(url), auth: headersOf(init)?.get('Authorization') ?? null });

      if (String(url).includes('/auth/refresh')) {
        return Promise.resolve(
          respond(200, { token: 'fresh-token', user: { email: 'a@test.com', role: 'user' } })
        );
      }
      // Expired first, fine once the new token is presented.
      return Promise.resolve(
        headersOf(init)?.get('Authorization') === 'Bearer fresh-token'
          ? respond(200, { ok: true })
          : respond(401)
      );
    });

    const res = await apiFetch(`${API_BASE_URL}/cart`);

    expect(res.status).toBe(200);
    expect(getToken()).toBe('fresh-token');
    expect(calls.map((c) => c.url.replace(API_BASE_URL, ''))).toEqual([
      '/cart',
      '/auth/refresh',
      '/cart',
    ]);
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not try to refresh a failed refresh', async () => {
    setSession({ token: 'expired', user: { email: 'a@test.com', role: 'user' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(401));

    await apiFetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST' });

    // One call only: no recursion.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh across concurrent requests', async () => {
    setSession({ token: 'expired', user: { email: 'a@test.com', role: 'user' } });

    let refreshCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCalls += 1;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                respond(200, { token: 'fresh-token', user: { email: 'a@test.com', role: 'user' } })
              ),
            10
          )
        );
      }
      return Promise.resolve(
        headersOf(init)?.get('Authorization') === 'Bearer fresh-token'
          ? respond(200, { ok: true })
          : respond(401)
      );
    });

    const results = await Promise.all([
      apiFetch(`${API_BASE_URL}/cart`),
      apiFetch(`${API_BASE_URL}/wishlist`),
      apiFetch(`${API_BASE_URL}/order/buyer`),
    ]);

    // Refresh tokens rotate, so a second concurrent refresh would present an
    // already-exchanged token and the server would revoke the whole family -
    // signing the user out for the crime of loading a busy page.
    expect(refreshCalls).toBe(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('does not redirect when already on the sign-in page', async () => {
    window.location.pathname = '/sign-in';
    setSession({ token: 'expired', user: { email: 'a@test.com', role: 'user' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(401));

    await apiFetch(`${API_BASE_URL}/cart`);

    expect(assign).not.toHaveBeenCalled();
  });

  it('leaves the session alone on a 403', async () => {
    setSession({ token: 'valid', user: { email: 'a@test.com', role: 'user' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(403, { message: 'Administrator access required' }));

    await apiFetch(`${API_BASE_URL}/user`);

    expect(getToken()).toBe('valid');
    expect(assign).not.toHaveBeenCalled();
  });

  it('returns the response untouched on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(200, { title: 'A Book' }));

    const res = await apiFetch(`${API_BASE_URL}/book`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ title: 'A Book' });
  });
});
