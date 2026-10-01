import { useSyncExternalStore } from 'react';

/**
 * What this visitor has agreed the site may keep in their browser, beyond
 * what it needs to work.
 *
 * Necessary - always on, and not a choice: staying signed in, security
 * checks on sign-in and sign-up, and this choice itself. Everything else
 * waits for a yes:
 *
 * - preferences: light or dark, the voice search language, list sizes and
 *   sorts, and recent searches;
 * - personalisation: the books viewed lately, for "Top picks for you";
 * - diagnostics: an error report sent to us when something breaks.
 *
 * Until a choice is made, none of those is kept; turning one off later deletes
 * what it had kept.
 */
export type ConsentCategory = 'preferences' | 'personalisation' | 'diagnostics';

export interface Consent {
  version: 1;
  /** When it was given, so a later change to these terms can ask again. */
  at: string;
  preferences: boolean;
  personalisation: boolean;
  diagnostics: boolean;
}

const KEY = 'consent';
const EVENT = 'bookstorebd:consent';
const OPEN_EVENT = 'bookstorebd:consent-open';

/** What each category keeps, so turning it off can delete it. */
export const STORED_BY: Record<Exclude<ConsentCategory, 'diagnostics'>, readonly string[]> = {
  preferences: ['theme', 'voiceLanguage', 'browsePageSize', 'wishlistSort', 'profileMode', 'recentSearches'],
  personalisation: ['recentlyViewed'],
};

/** In memory as well, for a browser that will not keep anything. */
let memory: Consent | null = null;
/** Whether the last attempt to store the choice worked; if not, memory stands in. */
let storageWorks = true;

export const readConsent = (): Consent | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return storageWorks ? null : memory;
    const parsed = JSON.parse(raw) as Partial<Consent>;
    if (parsed.version !== 1) return null;
    return {
      version: 1,
      at: String(parsed.at ?? ''),
      preferences: parsed.preferences === true,
      personalisation: parsed.personalisation === true,
      diagnostics: parsed.diagnostics === true,
    };
  } catch {
    return memory;
  }
};

/** Whether this kind of storage, or reporting, has been agreed to. */
export const allowed = (category: ConsentCategory): boolean => readConsent()?.[category] === true;

let cachedRaw: string | null | undefined;
let cachedValue: Consent | null = null;
/** The same object until the choice changes, as useSyncExternalStore needs. */
const snapshot = (): Consent | null => {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = memory ? JSON.stringify(memory) : null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = readConsent();
  }
  return cachedValue;
};

export const saveConsent = (choice: Omit<Consent, 'version' | 'at'>): void => {
  const consent: Consent = { version: 1, at: new Date().toISOString(), ...choice };
  memory = consent;
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
    storageWorks = true;
    // What is no longer agreed to goes.
    for (const [category, keys] of Object.entries(STORED_BY) as [keyof typeof STORED_BY, readonly string[]][]) {
      if (!consent[category]) for (const key of keys) localStorage.removeItem(key);
    }
  } catch {
    // Kept in memory for this visit.
    storageWorks = false;
  }
  window.dispatchEvent(new Event(EVENT));
};

export const acceptAll = (): void => saveConsent({ preferences: true, personalisation: true, diagnostics: true });
export const necessaryOnly = (): void => saveConsent({ preferences: false, personalisation: false, diagnostics: false });

/** Opens the choices again, from the footer or the privacy policy. */
export const openConsentSettings = (): void => {
  window.dispatchEvent(new Event(OPEN_EVENT));
};
export const onOpenConsentSettings = (listener: () => void): (() => void) => {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};

/** The choice, kept current; null until one is made. */
export const useConsent = (): Consent | null => useSyncExternalStore(subscribe, snapshot, () => null);
