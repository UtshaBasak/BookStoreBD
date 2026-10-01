import { useSyncExternalStore } from 'react';
import { allowed } from './consent.js';

/**
 * Light or dark. "system" follows the device, and is where everyone starts.
 *
 * The choice is applied as `data-theme` on <html>, which swaps the colour
 * tokens in index.css. public/theme-init.js does the same before the first
 * paint, so a dark page never flashes white while the app loads.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'theme';
const EVENT = 'bookstorebd:theme';
const darkQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** This visit's choice, for when it may not be stored. */
let sessionChoice: ThemeChoice | null = null;

export const readTheme = (): ThemeChoice => {
  if (sessionChoice) return sessionChoice;
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const resolveTheme = (choice: ThemeChoice): 'light' | 'dark' =>
  choice === 'system' ? (darkQuery()?.matches ? 'dark' : 'light') : choice;

export const applyTheme = (choice: ThemeChoice = readTheme()): void => {
  const resolved = resolveTheme(choice);
  document.documentElement.dataset.theme = resolved;
  // The browser's own toolbar, on phones that colour it.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0f0d18' : '#6d28d9');
};

export const setTheme = (choice: ThemeChoice): void => {
  sessionChoice = choice;
  try {
    // Remembered with the visitor's say-so; otherwise it lasts this visit.
    if (choice === 'system' || !allowed('preferences')) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(EVENT));
};

/**
 * Follows the device while the choice is "system", and keeps this visit's
 * choice once preferences may be stored. Called once, at start-up.
 */
export const watchSystemTheme = (): void => {
  window.addEventListener('bookstorebd:consent', () => {
    if (sessionChoice && sessionChoice !== 'system' && allowed('preferences')) {
      try {
        localStorage.setItem(KEY, sessionChoice);
      } catch {
        /* this visit only */
      }
    }
  });
  darkQuery()?.addEventListener('change', () => {
    if (readTheme() === 'system') {
      applyTheme('system');
      window.dispatchEvent(new Event(EVENT));
    }
  });
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** The choice, and the theme it comes to, kept current. */
export const useTheme = (): { choice: ThemeChoice; resolved: 'light' | 'dark'; setTheme: (choice: ThemeChoice) => void } => {
  const choice = useSyncExternalStore(subscribe, readTheme, () => 'system' as ThemeChoice);
  const resolved = useSyncExternalStore(subscribe, () => resolveTheme(readTheme()), () => 'light' as const);
  return { choice, resolved, setTheme };
};
