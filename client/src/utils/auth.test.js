import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  authHeaders,
  clearSession,
  getToken,
  getUserEmail,
  getUserRole,
  isAdmin,
  isAuthenticated,
  setSession,
} from './auth.js';

const session = {
  token: 'jwt-token-value',
  user: { id: '1', username: 'alice', email: 'alice@test.com', role: 'user' },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('setSession', () => {
  it('stores the token, e-mail and role', () => {
    setSession(session);

    expect(getToken()).toBe('jwt-token-value');
    expect(getUserEmail()).toBe('alice@test.com');
    expect(getUserRole()).toBe('user');
  });

  it('records an admin role', () => {
    setSession({ ...session, user: { ...session.user, role: 'admin' } });
    expect(isAdmin()).toBe(true);
  });
});

describe('isAuthenticated', () => {
  it('is false before signing in', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('is true once a session is stored', () => {
    setSession(session);
    expect(isAuthenticated()).toBe(true);
  });

  it('is false again after clearing', () => {
    setSession(session);
    clearSession();

    expect(isAuthenticated()).toBe(false);
    expect(getToken()).toBeNull();
    expect(getUserEmail()).toBeNull();
    expect(getUserRole()).toBeNull();
  });
});

describe('isAdmin', () => {
  it('is false for a normal user', () => {
    setSession(session);
    expect(isAdmin()).toBe(false);
  });

  it('is false when signed out', () => {
    expect(isAdmin()).toBe(false);
  });
});

describe('authHeaders', () => {
  it('is empty when signed out', () => {
    expect(authHeaders()).toEqual({});
  });

  it('carries the bearer token when signed in', () => {
    setSession(session);
    expect(authHeaders()).toEqual({ Authorization: 'Bearer jwt-token-value' });
  });
});

describe('storage failures', () => {
  // Private browsing and blocked site data both make localStorage throw.
  it('reading does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => getToken()).not.toThrow();
    expect(getToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('writing does not throw', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => setSession(session)).not.toThrow();
  });
});
