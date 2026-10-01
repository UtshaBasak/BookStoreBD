/**
 * What a new password must be.
 *
 * The rules follow NIST SP 800-63B and OWASP's guidance where they agree -
 * length first, a check against passwords that are common or already leaked,
 * nothing derived from the person themselves - with character classes on top,
 * because the shop asked for those too.
 *
 * Only a password being *set* is checked: signing up, resetting and changing
 * it. Signing in is not, so an account made under the old eight-character
 * rule keeps working with the password it has.
 *
 * `client/src/utils/passwordPolicy.ts` is a copy of the rules below, so the
 * form can tick them off as somebody types. The two test files check the same
 * cases; change one and change the other. The breach check is the server's
 * alone.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export type PasswordRule =
  | 'length'
  | 'lower'
  | 'upper'
  | 'number'
  | 'symbol'
  | 'personal'
  | 'common'
  | 'pattern';

/** Each rule as the form lists it. */
export const PASSWORD_RULES: readonly { id: PasswordRule; label: string }[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters` },
  { id: 'lower', label: 'A lowercase letter' },
  { id: 'upper', label: 'An uppercase letter' },
  { id: 'number', label: 'A number' },
  { id: 'symbol', label: 'A symbol, such as ! @ # ?' },
  { id: 'personal', label: 'Not your name or e-mail address' },
  { id: 'common', label: 'Not a common or easily guessed password' },
  { id: 'pattern', label: 'No runs like "aaaa", "1234" or "qwer"' },
];

/**
 * Passwords people pick most, as the words underneath them: "P@ssw0rd2024!"
 * comes down to "password". From the public lists of the most-used passwords,
 * plus what is obvious for this shop.
 */
const COMMON = new Set([
  'password', 'passwort', 'passw', 'pass', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
  'azerty', 'iloveyou', 'admin', 'administrator', 'welcome', 'letmein', 'login', 'monkey', 'dragon', 'master',
  'football', 'baseball', 'cricket', 'soccer', 'sunshine', 'princess', 'shadow', 'superman', 'batman', 'trustno',
  'whatever', 'freedom', 'starwars', 'pokemon', 'naruto', 'computer', 'internet', 'secret', 'changeme', 'default',
  'abc', 'abcd', 'abcdef', 'qazwsx', 'qwer', 'asdf', 'hello', 'hellohello', 'love', 'lovely', 'loveme', 'mylove',
  'family', 'friends', 'summer', 'winter', 'autumn', 'spring', 'flower', 'michael', 'jennifer', 'jordan', 'charlie',
  'thomas', 'hunter', 'killer', 'ranger', 'buster', 'tigger', 'cookie', 'chocolate', 'banana', 'orange', 'apple',
  'samsung', 'google', 'facebook', 'youtube', 'instagram', 'whatsapp', 'gmail', 'yahoo', 'microsoft', 'windows',
  'test', 'tester', 'testing', 'guest', 'user', 'username', 'root', 'toor', 'access', 'mustang', 'matrix',
  'blink', 'zaq', 'pakistan', 'india', 'bangladesh', 'dhaka', 'chittagong', 'sylhet', 'bangla', 'bengali',
  'allah', 'bismillah', 'mohammad', 'muhammad', 'rahman', 'islam', 'jesus', 'krishna', 'bookstore', 'bookstorebd',
  'books', 'book', 'reader', 'reading', 'library', 'shopping', 'store', 'online', 'mern', 'student', 'university',
  'secure', 'security', 'private', 'strong', 'strongpassword', 'mypassword', 'newpassword', 'oldpassword',
]);

/** Words a password may not contain at all, however much else surrounds them. */
const BANNED_WITHIN = ['password', 'passwort', 'qwerty', 'bookstore', 'letmein', 'iloveyou'];

/** Leetspeak back to letters, so "p@55w0rd" is seen as "password". */
const UNLEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };

const ROWS = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** Four or more of one character, or four steps along a row either way. */
const hasRun = (value: string): boolean => {
  const lower = value.toLowerCase();
  if (/(.)\1{3,}/u.test(lower)) return true;
  for (const row of ROWS) {
    const reversed = [...row].reverse().join('');
    for (let i = 0; i + 4 <= row.length; i += 1) {
      if (lower.includes(row.slice(i, i + 4)) || lower.includes(reversed.slice(i, i + 4))) return true;
    }
  }
  return false;
};

/** The letters underneath, with leetspeak undone and everything else dropped. */
const lettersOf = (value: string): string =>
  [...value.toLowerCase()].map((c) => UNLEET[c] ?? c).join('').replace(/[^a-z]/g, '');

/**
 * The part from the first letter (or the @ and $ that stand for letters) to
 * the last letter: "welcome12345!" is "welcome". A scan rather than a regex
 * trimming both ends, which backtracks badly on a long run of symbols.
 */
const middleWord = (lower: string): string => {
  let start = 0;
  while (start < lower.length && !/[a-z@$]/.test(lower.charAt(start))) start += 1;
  let end = lower.length;
  while (end > start && !/[a-z]/.test(lower.charAt(end - 1))) end -= 1;
  return lower.slice(start, end);
};

const isCommon = (value: string): boolean => {
  const lower = value.toLowerCase();
  // Read three ways: the letters alone ("Welcome12345!" is "welcome"), the
  // letters with leetspeak undone ("p@55w0rd" is "password"), and the word in
  // the middle with what is stuck on either end dropped first, so the digits
  // of "Welcome12345!" are not misread as leetspeak.
  const readings = [
    lower.replace(/[^a-z]/g, ''),
    lettersOf(value),
    lettersOf(middleWord(lower)),
  ];
  if (!readings[0] && !readings[1]) return true; // all digits and symbols: a PIN, not a password
  return readings.some((letters) => {
    if (!letters) return false;
    if (COMMON.has(letters)) return true;
    if (BANNED_WITHIN.some((word) => letters.includes(word))) return true;
    // "password123password" and "qwertyqwerty": the same word twice.
    for (const word of COMMON) {
      if (word.length >= 4 && letters.replaceAll(word, '') === '') return true;
    }
    return false;
  });
};

/** Names and the e-mail's local part, broken into the parts a person would reuse. */
const personalParts = (context: { email?: string | null; username?: string | null }): string[] => {
  const raw = [context.username ?? '', (context.email ?? '').split('@')[0] ?? ''];
  const parts = raw.flatMap((value) => [value, ...value.split(/[^a-z0-9]+/i)]);
  return [...new Set(parts.map((part) => part.toLowerCase()).filter((part) => part.length >= 3))];
};

const usesPersonal = (value: string, context: { email?: string | null; username?: string | null }): boolean => {
  const lower = value.toLowerCase();
  const letters = lettersOf(value);
  return personalParts(context).some((part) => {
    const partLetters = lettersOf(part);
    return lower.includes(part) || (partLetters.length >= 4 && letters.includes(partLetters));
  });
};

/**
 * The rules this password breaks, in the order the form lists them. Empty
 * means it may be used, subject to the breach check.
 */
export const passwordProblems = (
  password: string,
  context: { email?: string | null; username?: string | null } = {}
): PasswordRule[] => {
  const problems: PasswordRule[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) problems.push('length');
  if (!/\p{Ll}/u.test(password)) problems.push('lower');
  if (!/\p{Lu}/u.test(password)) problems.push('upper');
  if (!/\p{Nd}/u.test(password)) problems.push('number');
  if (!/[^\p{L}\p{Nd}\s]/u.test(password)) problems.push('symbol');
  if (usesPersonal(password, context)) problems.push('personal');
  if (isCommon(password)) problems.push('common');
  if (hasRun(password)) problems.push('pattern');
  return problems;
};

/** The sentence a refused password is answered with. */
export const passwordMessage = (problems: readonly PasswordRule[]): string => {
  if (!problems.length) return '';
  const first = PASSWORD_RULES.find((rule) => rule.id === problems[0]);
  if (problems[0] === 'length' && first) return `Your password needs ${first.label.toLowerCase()} (and at most ${PASSWORD_MAX}).`;
  return `Your password needs: ${problems
    .map((id) => PASSWORD_RULES.find((rule) => rule.id === id)?.label.toLowerCase())
    .filter(Boolean)
    .join('; ')}.`;
};
