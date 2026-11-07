/**
 * Phone numbers, e-mail addresses and links inside free text.
 *
 * Two uses: they are taken out of anything sent to the Gemini API (a shopper
 * may type their number into a question; a review may carry one), and they are
 * a moderation signal - contact details in a review or a listing's
 * description usually mean someone is trying to take a sale off the site.
 *
 * Bangla digits are read as digits, so `০১৭১২৩৪৫৬৭৮` is a phone number too.
 */

const BANGLA_ZERO = 0x09e6;

/** `০১২` → `012`. Everything else is left as it is. */
export const toAsciiDigits = (text: string): string =>
  text.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - BANGLA_ZERO));

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const URL = /\b(?:https?:\/\/|www\.)[^\s<>"']+|\b[a-z0-9-]+\.(?:com|net|org|xyz|info|bd|io|me|link|shop|top|site|online)(?:\/[^\s<>"']*)?/gi;
/*
 * A run of digits with the separators people put in numbers. Ten or more
 * digits is a phone number or an account number: an ISBN in a description is
 * the one honest exception, and it is recognised below.
 */
const DIGIT_RUN = /\+?\d[\d\s().-]{8,}\d/g;
const ISBN_PREFIX = /^(?:97[89])/;

export interface ContactDetails {
  phones: string[];
  emails: string[];
  links: string[];
}

const digitsOf = (text: string): string => text.replace(/\D/g, '');

/** A Bangladeshi mobile number (bKash, Nagad and calls alike), or any long number that is not an ISBN. */
const isPhoneLike = (run: string): boolean => {
  const digits = digitsOf(run);
  if (digits.length < 10 || digits.length > 15) return false;
  if (/^(?:880|0)?1[3-9]\d{8}$/.test(digits)) return true;
  return !(digits.length === 13 && ISBN_PREFIX.test(digits)) && digits.length !== 10;
};

/** The contact details in a text. */
export const findContactDetails = (text: string): ContactDetails => {
  const ascii = toAsciiDigits(text);
  const emails = ascii.match(EMAIL) ?? [];
  const withoutEmails = ascii.replace(EMAIL, ' ');
  const links = (withoutEmails.match(URL) ?? []).filter((link) => !/^\d/.test(link));
  const phones = (withoutEmails.match(DIGIT_RUN) ?? []).filter(isPhoneLike).map((run) => run.trim());
  return { phones, emails, links };
};

export const hasContactDetails = (text: string): boolean => {
  const found = findContactDetails(text);
  return Boolean(found.phones.length || found.emails.length || found.links.length);
};

/**
 * The text with its contact details replaced by placeholders, for sending to
 * the model. Bangla digits are converted first so none slips through.
 */
export const stripContactDetails = (text: string): string =>
  toAsciiDigits(text)
    .replace(EMAIL, '[email]')
    .replace(URL, (link) => (/^\d/.test(link) ? link : '[link]'))
    .replace(DIGIT_RUN, (run) => (isPhoneLike(run) ? '[number]' : run));
