import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { apiFetch, apiUrl, API_BASE_URL } from './api.js';
import { setSession, getToken } from '../utils/auth.js';

const respond = (status = 200, body = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let assign;

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

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches the bearer token when signed in', async () => {
    setSession({ token: 'abc123', user: { email: 'a@test.com', role: 'user' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond());

    await apiFetch(`${API_BASE_URL}/cart`);

    const headers = fetchMock.mock.calls[0][1].headers;
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
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.headers.get('Authorization')).toBe('Bearer abc123');
    expect(init.method).toBe('POST');
  });

  it('does not overwrite an Authorization header set by the caller', async () => {
    setSession({ token: 'abc123', user: { email: 'a@test.com', role: 'user' } });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond());

    await apiFetch(`${API_BASE_URL}/cart`, { headers: { Authorization: 'Bearer explicit' } });

    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer explicit');
  });

  it('clears the session and redirects on 401', async () => {
    setSession({ token: 'expired', user: { email: 'a@test.com', role: 'user' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(401, { message: 'Authentication required' }));

    const res = await apiFetch(`${API_BASE_URL}/cart`);

    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith('/sign-in');
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
