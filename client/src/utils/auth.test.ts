import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  clearSession,
  getToken,
  getUserEmail,
  getUserRole,
  isAdmin,
  isAuthenticated,
  setSession,
} from './auth.js';
import type { SessionPayload } from './auth.js';

const session: SessionPayload = {
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

describe('the token', () => {
  it('is kept in memory, not in localStorage', () => {
    setSession(session);
    expect(JSON.stringify({ ...localStorage })).not.toContain('jwt-token-value');
  });

  it('removes a copy an older version left in localStorage, on load', async () => {
    localStorage.setItem('authToken', 'left-behind');
    vi.resetModules();
    await import('./auth.js');
    expect(localStorage.getItem('authToken')).toBeNull();
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
