/**
 * English or Bangla. "system" follows the browser's own language list, and is
 * where everyone starts: someone whose browser prefers Bangla gets Bangla.
 *
 * Every piece of text is written in both languages where it is used:
 *
 *   t('Add to cart', 'কার্টে যোগ করুন')
 *
 * rather than looked up by a key, so the two can never drift apart and a
 * missing translation does not compile. `t` reads the current language when
 * it is called; App re-renders the whole tree when the language changes, so
 * nothing needs to subscribe to use it.
 *
 * The choice is kept in this browser without asking (see utils/consent.ts):
 * it is what the visitor asked to read the site in, which is not a
 * preference to be tracked but the site working as asked. Signed in, it is
 * also kept on the account, so e-mails and notifications arrive in it.
 */
export type Language = 'en' | 'bn';
export type LanguageChoice = 'system' | Language;

const KEY = 'language';
const EVENT = 'bookstorebd:language';

/** This visit's choice, for a browser that will not store it. */
let sessionChoice: LanguageChoice | null = null;

export const readLanguageChoice = (): LanguageChoice => {
  if (sessionChoice) return sessionChoice;
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'en' || stored === 'bn' ? stored : 'system';
  } catch {
    return 'system';
  }
};

/** The first of the browser's languages that the site speaks; English if none. */
export const systemLanguage = (): Language => {
  const listed =
    typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of listed) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (base === 'bn' || base === 'en') return base;
  }
  return 'en';
};

export const resolveLanguage = (choice: LanguageChoice): Language => (choice === 'system' ? systemLanguage() : choice);

/** The language the site is showing now. */
export const currentLanguage = (): Language => resolveLanguage(readLanguageChoice());

/** The same thing in both languages; this returns the one being shown. */
export const t = (en: string, bn: string): string => (currentLanguage() === 'bn' ? bn : en);

/** For text that is a piece of markup rather than a string. */
export const pick = <T>(en: T, bn: T): T => (currentLanguage() === 'bn' ? bn : en);

/**
 * A locale for Intl. Bangla is `bn-BD`, which writes Bangla digits and month
 * names. English keeps what a call site asked for - `en-GB`, `en-IN`, or the
 * browser's own when it asked for nothing.
 */
export const localeFor = (english?: string): string | undefined => (currentLanguage() === 'bn' ? 'bn-BD' : english);

/** A number, with Bangla digits in Bangla. Grouped as in South Asia: 1,20,000. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  Number(value).toLocaleString(localeFor('en-IN'), options);

/** A date, with Bangla month names and digits in Bangla. */
export const formatDate = (
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
  english?: string
): string => new Date(value).toLocaleDateString(localeFor(english), options);

/** A time of day. */
export const formatTime = (
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
  english?: string
): string => new Date(value).toLocaleTimeString(localeFor(english), options);

/** A date and a time. */
export const formatDateTime = (
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions,
  english?: string
): string => new Date(value).toLocaleString(localeFor(english), options);

/** Western digits in a string turned into Bangla ones, in Bangla: order numbers stay as they are. */
export const digits = (value: string | number): string =>
  currentLanguage() === 'bn' ? String(value).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]) : String(value);

/** `lang` on <html>, so screen readers, hyphenation and fonts know. */
export const applyLanguage = (language: Language = currentLanguage()): void => {
  document.documentElement.lang = language;
};

/** Told when the language changes, so a signed-in account can keep it too. */
const listeners = new Set<(language: Language) => void>();
export const onLanguageChange = (listener: (language: Language) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setLanguage = (choice: LanguageChoice): void => {
  const before = currentLanguage();
  sessionChoice = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  const now = currentLanguage();
  applyLanguage(now);
  window.dispatchEvent(new Event(EVENT));
  if (now !== before) for (const listener of listeners) listener(now);
};

/** Follows the browser while the choice is "system". Called once, at start-up. */
export const watchSystemLanguage = (): void => {
  window.addEventListener('languagechange', () => {
    if (readLanguageChoice() === 'system') {
      applyLanguage();
      window.dispatchEvent(new Event(EVENT));
      for (const listener of listeners) listener(currentLanguage());
    }
  });
};
