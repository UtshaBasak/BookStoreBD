import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTheme, readTheme, resolveTheme, setTheme } from './theme.js';

const prefersDark = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: dark && query.includes('dark'), addEventListener: vi.fn() }));

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('the theme', () => {
  it('follows the device until a choice is made', () => {
    prefersDark(true);
    expect(readTheme()).toBe('system');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');

    prefersDark(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it('remembers a choice, and forgets it when set back to the device', () => {
    prefersDark(true);
    localStorage.setItem('consent', JSON.stringify({ version: 1, at: '', preferences: true, personalisation: false, diagnostics: false }));
    setTheme('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    setTheme('system');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps a choice for the visit only, until preferences may be stored', () => {
    localStorage.removeItem('consent');
    prefersDark(false);
    setTheme('dark');
    expect(localStorage.getItem('theme')).toBeNull();
    expect(readTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
