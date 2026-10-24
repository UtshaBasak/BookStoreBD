import { bnDigits } from '../utils/language.js';

/**
 * The Bangla for every message the schemas in this folder write themselves.
 *
 * Zod schemas are built when the module loads, before any request, so their
 * messages are in English. middleware/validate.ts looks each one up here when
 * a request asks for Bangla; anything not found (Zod's own default messages)
 * gets GENERIC_BN instead. Add the Bangla here whenever a schema gains a
 * message.
 */
export const MESSAGES_BN: Readonly<Record<string, string>> = {
  // common.ts
  'Must be a valid id': 'সঠিক আইডি দিন',
  'Must be a valid email address': 'সঠিক ই-মেইল ঠিকানা দিন',
  'Password is required': 'পাসওয়ার্ড দিন',
  'Password is too long': 'পাসওয়ার্ডটি অনেক লম্বা',
  'Username must be at least 3 characters': 'ইউজারনেম অন্তত ৩ অক্ষরের হতে হবে',
  'Code must be six digits': 'কোডটি ৬ সংখ্যার হতে হবে',
  'Must be a whole number': 'পূর্ণ সংখ্যা দিন',
  'Must not be negative': 'ঋণাত্মক সংখ্যা দেওয়া যাবে না',
  'Must be greater than zero': 'শূন্যের বেশি হতে হবে',
  'Must be a valid order number': 'সঠিক অর্ডার নম্বর দিন',
  'Enter an 11-digit mobile number, like 01712345678': '১১ সংখ্যার মোবাইল নম্বর লিখুন, যেমন 01712345678',

  // index.ts
  'Must be base64': 'base64 হতে হবে',
  'Must be an installation id': 'সঠিক ইনস্টলেশন আইডি দিন',
  'Not a push token': 'এটি পুশ টোকেন নয়',
  'Type something to search for': 'খোঁজার জন্য কিছু লিখুন',
  'At least one item is required': 'অন্তত একটি বই লাগবে',
  'Must be 8-64 letters, digits, - or _': '৮-৬৪টি অক্ষর, সংখ্যা, - বা _ হতে হবে',
  'Cash on Delivery is the only payment method': 'ক্যাশ অন ডেলিভারিই একমাত্র পেমেন্ট পদ্ধতি',
  'Enter the name to deliver to': 'যাঁর কাছে ডেলিভারি হবে তাঁর নাম লিখুন',
  'Choose a division from the list': 'তালিকা থেকে একটি বিভাগ বেছে নিন',
  'Choose a district': 'জেলা বেছে নিন',
  'Enter the delivery address: house, road and area': 'ডেলিভারির ঠিকানা লিখুন: বাড়ি, রোড ও এলাকা',
  'Keep the note to 300 characters': 'নোটটি ৩০০ অক্ষরের মধ্যে রাখুন',
  'Status is required': 'স্ট্যাটাস দিন',
  'Enter a code': 'একটি কোড লিখুন',
  'Enter the bKash transaction ID, e.g. 8N7A2B3C4D': 'বিকাশ ট্রানজ্যাকশন আইডি লিখুন, যেমন 8N7A2B3C4D',
  'A description is required': 'একটি বিবরণ লিখুন',
  'Title is required': 'বইয়ের নাম দিন',
  'Author is required': 'লেখকের নাম দিন',
  'At least one category is required': 'অন্তত একটি ক্যাটাগরি বেছে নিন',
  'Your password is required to delete the account': 'অ্যাকাউন্ট মুছতে আপনার পাসওয়ার্ড দিন',
  'Enter your password to change your e-mail address': 'ই-মেইল ঠিকানা বদলাতে আপনার পাসওয়ার্ড দিন',
  'Add an e-mail address': 'একটি ই-মেইল ঠিকানা যোগ করুন',
  'Up to five at a time': 'একবারে সর্বোচ্চ পাঁচটি',
  'A reply needs something in it': 'উত্তরে কিছু লিখুন',
  'Give the title': 'বইয়ের নাম দিন',
  'An ISBN is digits, perhaps with an X': 'ISBN-এ শুধু সংখ্যা থাকে, কখনো একটি X',
  'Give it a title': 'একটি শিরোনাম দিন',
  'Write the message': 'বার্তাটি লিখুন',
  'A page on this site, starting with /': 'এই সাইটের একটি পেজ, / দিয়ে শুরু',
  'Choose at least one person': 'অন্তত একজনকে বেছে নিন',
};

/** Messages with a value inside them, matched by shape. */
const PATTERNS_BN: readonly [RegExp, (...parts: string[]) => string][] = [
  [/^Must be at least (-?\d+)$/, (n = '') => `অন্তত ${bnDigits(n)} হতে হবে`],
  [/^Must be at most (-?\d+)$/, (n = '') => `সর্বোচ্চ ${bnDigits(n)} হতে পারে`],
  [/^Choose a district in (.+) division$/, (division = '') => `${division} বিভাগের একটি জেলা বেছে নিন`],
];

/** For Zod's own messages, which name no field and are not listed above. */
export const GENERIC_BN = 'এই তথ্যটি সঠিক নয়';

/** What 'Validation failed' says in Bangla. */
export const VALIDATION_FAILED_BN = 'দেওয়া তথ্যে ভুল আছে';

/** The Bangla for a schema message: its own when known, the generic one when not. */
export const validationMessageBn = (message: string): string => {
  const known = MESSAGES_BN[message];
  if (known) return known;
  for (const [pattern, render] of PATTERNS_BN) {
    const match = pattern.exec(message);
    if (match) return render(...match.slice(1));
  }
  return GENERIC_BN;
};
