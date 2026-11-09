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

/** Digits as words, in English, Bangla and Banglish: how a number is hidden from a simple check. */
const NUMBER_WORDS: Record<string, string> = Object.fromEntries(
  (
    [
      ['zero', '0'], ['oh', '0'], ['one', '1'], ['two', '2'], ['three', '3'], ['four', '4'],
      ['five', '5'], ['six', '6'], ['seven', '7'], ['eight', '8'], ['nine', '9'],
      ['shunno', '0'], ['shunyo', '0'], ['ek', '1'], ['dui', '2'], ['tin', '3'], ['char', '4'], ['pach', '5'],
      ['panch', '5'], ['choy', '6'], ['chhoy', '6'], ['sat', '7'], ['saat', '7'], ['at', '8'], ['aat', '8'], ['noy', '9'], ['noi', '9'],
      ['শূন্য', '0'], ['এক', '1'], ['দুই', '2'], ['তিন', '3'], ['চার', '4'], ['পাঁচ', '5'], ['ছয়', '6'], ['সাত', '7'], ['আট', '8'], ['নয়', '9'],
    ] as const
  ).map(([word, digit]) => [word.normalize('NFC'), digit])
);

const digitOf = (word: string): string | undefined => NUMBER_WORDS[word.toLowerCase().normalize('NFC')];

const WORD = /[\p{L}\p{M}]+/gu;

/**
 * Runs of eight or more digit-words ("zero one seven one ...") written as
 * digits, so a number spelled out is still a number. Shorter runs - "one or
 * two", "at eight" - are ordinary words and stay as they are.
 */
export const spelledDigits = (text: string): string => {
  const words = [...text.matchAll(WORD)];
  let out = '';
  let last = 0;
  let i = 0;
  while (i < words.length) {
    let j = i;
    while (j < words.length) {
      const word = words[j];
      const digit = word ? digitOf(word[0]) : undefined;
      if (digit === undefined) break;
      const next = words[j + 1];
      // Only spaces, hyphens or commas between the words of one number.
      if (next && word && !/^[\s,-]*$/.test(text.slice((word.index ?? 0) + word[0].length, next.index))) {
        j += 1;
        break;
      }
      j += 1;
    }
    if (j - i >= 8) {
      const first = words[i];
      const end = words[j - 1];
      if (first && end) {
        out += text.slice(last, first.index) + words.slice(i, j).map((word) => digitOf(word[0])).join('');
        last = (end.index ?? 0) + end[0].length;
      }
      i = j;
    } else {
      i += 1;
    }
  }
  return out + text.slice(last);
};

// Bounded parts, and a domain of labels that cannot overlap, so a long run
// of odd characters cannot make the match slow.
const EMAIL = /[a-z0-9._%+-]{1,64}@(?:[a-z0-9-]{1,63}\.){1,8}[a-z]{2,24}\b/gi;
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
  const ascii = spelledDigits(toAsciiDigits(text));
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
  spelledDigits(toAsciiDigits(text))
    .replace(EMAIL, '[email]')
    .replace(URL, (link) => (/^\d/.test(link) ? link : '[link]'))
    .replace(DIGIT_RUN, (run) => (isPhoneLike(run) ? '[number]' : run));
