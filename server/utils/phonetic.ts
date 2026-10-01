/**
 * A sound-alike key, so a search typed in one script finds a book
 * written in the other: "putul nacher itikotha" finds পুতুলনাচের ইতিকথা, and
 * "হ্যারি পটার" finds Harry Potter.
 *
 * Both scripts are reduced to the same thing: their consonants, as sound
 * classes, in order, with vowels, spaces and punctuation dropped. Vowels are
 * where transliteration disagrees most - "itikatha", "itikotha", "itikothaa" -
 * and consonants are where it agrees, so a key of consonants alone survives
 * the guesswork of somebody spelling a Bangla title in English. Aspirated and
 * plain pairs (ক/খ, ত/থ, ব/ভ) share a class, as do the three sibilants, for
 * the same reason.
 *
 * It is deliberately loose. It only ever adds results to the ordinary search,
 * and only for a query long enough that a loose match still means something.
 */

/** Bangla letters to their consonant class; a vowel or sign maps to ''. */
const BANGLA: Record<string, string> = {
  // Consonants
  'ক': 'K', 'খ': 'K', 'গ': 'G', 'ঘ': 'G', 'ঙ': 'N',
  'চ': 'C', 'ছ': 'C', 'জ': 'J', 'ঝ': 'J', 'ঞ': 'N',
  'ট': 'T', 'ঠ': 'T', 'ড': 'D', 'ঢ': 'D', 'ণ': 'N',
  'ত': 'T', 'থ': 'T', 'দ': 'D', 'ধ': 'D', 'ন': 'N',
  'প': 'P', 'ফ': 'P', 'ব': 'B', 'ভ': 'B', 'ম': 'M',
  'য': 'J', 'র': 'R', 'ল': 'L', 'শ': 'S', 'ষ': 'S', 'স': 'S', 'হ': 'H',
  'ড়': 'R', 'ঢ়': 'R', 'য়': '', 'ৎ': 'T',
  // Signs that carry a consonant sound
  // Chandrabindu nasalises a vowel; English spellings write it as an n
  // (পাঁচালী, Panchali; চাঁদ, Chand).
  'ং': 'N', 'ঃ': 'H', 'ঁ': 'N',
  // Digits, kept as digits so a volume number still matches
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

/**
 * Latin spellings to the same classes, longest first so "ch" is read before
 * "c". "ph" and "f" share P with প/ফ; "v" and "w" are read as ব (B) the way
 * Bangla borrows them; "x" is "ks".
 */
const LATIN: [string, string][] = [
  ['sch', 'S'], ['chh', 'C'], ['ksh', 'KS'],
  ['ch', 'C'], ['sh', 'S'], ['kh', 'K'], ['gh', 'G'], ['th', 'T'], ['dh', 'D'],
  ['ph', 'P'], ['bh', 'B'], ['jh', 'J'], ['rh', 'R'], ['ng', 'N'], ['ck', 'K'],
  ['b', 'B'], ['c', 'K'], ['d', 'D'], ['f', 'P'], ['g', 'G'], ['h', 'H'], ['j', 'J'],
  ['k', 'K'], ['l', 'L'], ['m', 'M'], ['n', 'N'], ['p', 'P'], ['q', 'K'], ['r', 'R'],
  ['s', 'S'], ['t', 'T'], ['v', 'B'], ['w', ''], ['x', 'KS'], ['z', 'J'],
];

const BANGLA_RANGE = /[ঀ-৿]/;

const latinKey = (text: string): string => {
  const lower = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  let out = '';
  for (let i = 0; i < lower.length; ) {
    const ch = lower.charAt(i);
    if (/[0-9]/.test(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    const match = LATIN.find(([spelling]) => lower.startsWith(spelling, i));
    if (match) {
      out += match[1];
      i += match[0].length;
    } else {
      i += 1; // a vowel, a space, punctuation
    }
  }
  return out;
};

const banglaKey = (text: string): string => {
  let out = '';
  let previous = '';
  // NFC does not recompose ড়, ঢ় and য় (they are composition exclusions), so
  // each arrives as a base letter and a nukta, read here as one.
  const letters = [...text.normalize('NFC')];
  for (let i = 0; i < letters.length; i += 1) {
    const ch = letters[i] ?? '';
    if (letters[i + 1] === '়') {
      // য় is a vowel glide; ড় and ঢ় are flapped r's.
      out += ch === 'য' ? '' : ch === 'ড' || ch === 'ঢ' ? 'R' : (BANGLA[ch] ?? '');
      previous = ch;
      i += 1;
      continue;
    }
    // য-ফলা and ব-ফলা after a hasant are a glide or a doubling, not a
    // consonant of their own: হ্যারি is "hyari", বিশ্ব is "bishwo".
    if (previous === '্' && (ch === 'য' || ch === 'ব')) {
      previous = ch;
      continue;
    }
    previous = ch;
    if (ch in BANGLA) out += BANGLA[ch];
    else if (/[0-9]/.test(ch)) out += ch;
    else if (/[a-z]/i.test(ch)) out += latinKey(ch);
  }
  return out;
};

/** "HH" is one H: a doubled letter, or one written twice by transliteration. */
const collapse = (key: string): string => key.replace(/(.)\1+/g, '$1');

/**
 * The key for a title, author or query. Mixed text is read piece by piece, so
 * "Harry Potter ও পরশপাথর" keys both halves.
 */
export const phoneticKey = (text: string | null | undefined): string => {
  if (!text) return '';
  const parts = text.split(/(\s+)/);
  const key = parts.map((part) => (BANGLA_RANGE.test(part) ? banglaKey(part) : latinKey(part))).join('');
  return collapse(key);
};

/** The key word by word, so a short query can be matched to the start of one. */
export const phoneticWords = (text: string | null | undefined): string =>
  (text ?? '')
    .split(/\s+/)
    .map((word) => phoneticKey(word))
    .filter(Boolean)
    .join(' ');

/**
 * The shortest query key matched anywhere in a title. Two consonants are
 * matched too, but only at the start of a word: দেয়াল and Deyal are both
 * just "DL", which turns up inside a great many other titles.
 */
export const PHONETIC_MIN = 3;

/**
 * The key a listing is searched by: title and author run together, for a
 * query typed with other spaces ("putulnacher" or "putul nacher"), then,
 * after a bar, the same word by word, for a short query matched at the start
 * of a word.
 */
export const bookSearchKey = (book: { title?: string | null; author?: string | null }): string =>
  `${phoneticKey(book.title)} ${phoneticKey(book.author)}|${phoneticWords(book.title)} ${phoneticWords(book.author)}`;

/** What a query's key is matched with, or null when it is too short to mean anything. */
export const phoneticPattern = (query: string): RegExp | null => {
  // Keys are made of A-Z and digits only, so nothing in one needs escaping.
  const key = phoneticKey(query).replace(/[^A-Z0-9]/g, '');
  if (key.length >= PHONETIC_MIN) return new RegExp(key);
  if (key.length === 2) return new RegExp(`(^|[ |])${key}`);
  return null;
};
