import type { IncomingHttpHeaders } from 'http';

/**
 * English or Bangla: the two languages the site speaks.
 *
 * The website sends the language it is showing as `Accept-Language` on every
 * call (client/src/config/api.ts), and what it is told comes back in that
 * language. Text is written in both where it is used -
 *
 *   t(req, 'Order not found', 'অর্ডারটি পাওয়া যায়নি')
 *
 * - so the two cannot drift apart. A caller that names neither language, as a
 * script or an older app does, gets English, as before.
 *
 * What goes out later - e-mails, notifications - uses the language the
 * account last chose (`User.language`), since there is no request to ask.
 */
export type Language = 'en' | 'bn';
export const LANGUAGES: readonly Language[] = ['en', 'bn'];

/** The same text in both languages. */
export interface Bilingual {
  en: string;
  bn: string;
}

type WithHeaders = { headers?: IncomingHttpHeaders };

/**
 * The language a request asks for, if it asks for one the site speaks: the
 * highest-weighted of `en` and `bn` in Accept-Language, the first listed on a
 * tie. Null when it names neither.
 */
export const requestedLanguage = (req: WithHeaders | undefined): Language | null => {
  const header = req?.headers?.['accept-language'];
  if (typeof header !== 'string' || !header) return null;
  let best: { language: Language; q: number } | null = null;
  for (const part of header.split(',').slice(0, 20)) {
    const [tag = '', ...params] = part.trim().split(';');
    const base = tag.trim().toLowerCase().split('-')[0];
    if (base !== 'en' && base !== 'bn') continue;
    const weight = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = weight ? Number(weight.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { language: base, q };
  }
  return best?.language ?? null;
};

/** The language to answer a request in. */
export const languageOf = (req: WithHeaders | undefined): Language => requestedLanguage(req) ?? 'en';

/** The text for the language a request asks for. */
export const t = (req: WithHeaders | undefined, en: string, bn: string): string => (languageOf(req) === 'bn' ? bn : en);

/** The text for a language already known, such as an account's. */
export const inLanguage = (language: Language | null | undefined, en: string, bn: string): string =>
  language === 'bn' ? bn : en;

/** Plain text stays as it is; text in both languages gives the one asked for. */
export const textIn = (language: Language | null | undefined, text: string | Bilingual): string =>
  typeof text === 'string' ? text : language === 'bn' ? text.bn : text.en;

/** Western digits as Bangla ones, for numbers inside Bangla text. */
export const bnDigits = (value: string | number): string =>
  String(value).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);

/** A stored value as a language, English when it is anything else. */
export const asLanguage = (value: unknown): Language => (value === 'bn' ? 'bn' : 'en');
