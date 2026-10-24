/**
 * The e-mails the shop sends, as HTML with a plain-text twin, branded so that
 * a code arrives looking like the shop rather than like phishing.
 *
 * Written for mail clients rather than browsers: tables for layout, every
 * style inline, no web fonts, no images to be blocked. The code is one run of
 * text spaced by CSS, so it copies as "208915" rather than "2 0 8 9 1 5".
 * The plain-text part carries everything the HTML does, for clients that show
 * no HTML and for anything that reads mail as text.
 */
import { SHOP_LOCATION, SUPPORT_EMAIL } from '../config/contact.js';
import { bnDigits, inLanguage, type Language } from './language.js';
import { OTP_TTL_MS } from './otpStore.js';

const SHOP = 'BookStoreBD';
const SUPPORT = SUPPORT_EMAIL;
const PLACE = SHOP_LOCATION;
const PLACE_BN = 'ঢাকা, বাংলাদেশ';

const BRAND = '#6d28d9';
const BRAND_DARK = '#5b21b6';
const TINT = '#f3efff';
const INK = '#111827';
const MUTED = '#6b7280';
const ACCENT = '#ff5c35';
const DEEP = '#1e1b4b';
const SANS = "'Plus Jakarta Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface Email {
  subject: string;
  text: string;
  html: string;
}

/**
 * A template waiting for a language. Every e-mail is written in both, and the
 * one that goes out is chosen when it is sent: by the recipient's account
 * (`dispatchShopMail`), or by the request that caused it where the recipient
 * has no account yet.
 */
export type MailFor = (language: Language) => Email;

/** Only for our own fixed strings and digits, but escaped regardless. */
const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const minutes = Math.round(OTP_TTL_MS / 60000);

/** A number inside text: Bangla digits in Bangla. */
const num = (language: Language, value: number | string): string => (language === 'bn' ? bnDigits(value) : String(value));

/** The site's address, when known, for a link back to it. */
const siteUrl = (): string =>
  (process.env.PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');

/**
 * The frame every message shares: a coloured header with the shop's name and
 * what the message is, the body, and a footer saying who sent it and why.
 */
const layout = ({
  heading,
  preheader,
  body,
  language,
}: {
  heading: string;
  preheader: string;
  body: string;
  language: Language;
}): string => {
  const url = siteUrl();
  const year = num(language, new Date().getFullYear());
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${TINT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${TINT};">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TINT};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #ece8f7;">
<tr><td align="center" bgcolor="${BRAND}" style="background:${BRAND};background-image:linear-gradient(135deg,${DEEP} 0%,${BRAND} 55%,${ACCENT} 100%);padding:32px 24px;">
<div style="font-family:${SANS};font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">BookStore<span style="color:#facc15;">BD</span></div>
<div style="font-family:${SANS};font-size:14px;color:#ede9fe;margin-top:6px;">${escape(heading)}</div>
</td></tr>
<tr><td style="padding:32px 32px 8px;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};">
${body}
</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid #ece8f7;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};" align="center">
${inLanguage(language, 'Questions? Write to', 'প্রশ্ন থাকলে লিখুন:')} <a href="mailto:${SUPPORT}" style="color:${BRAND_DARK};">${SUPPORT}</a>${url ? ` &middot; <a href="${escape(url)}" style="color:${BRAND_DARK};">${escape(url.replace(/^https?:\/\//, ''))}</a>` : ''}<br>
&copy; ${year} ${SHOP}, ${inLanguage(language, PLACE, PLACE_BN)}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

const paragraph = (html: string, extra = ''): string =>
  `<p style="margin:0 0 16px;${extra}">${html}</p>`;

const textFooter = (language: Language): string => {
  const url = siteUrl();
  return [
    inLanguage(language, `Questions? Write to ${SUPPORT}.`, `প্রশ্ন থাকলে লিখুন: ${SUPPORT}`),
    url,
    `${SHOP}, ${inLanguage(language, PLACE, PLACE_BN)}`,
  ]
    .filter(Boolean)
    .join('\n');
};

type CodePurpose = 'register' | 'reset' | 'signin' | 'delete-account' | 'two-factor-off' | 'email-change';

const copyFor = (
  purpose: CodePurpose,
  language: Language
): { subject: string; heading: string; lead: string; ignore?: string } => {
  const say = (en: string, bn: string): string => inLanguage(language, en, bn);
  switch (purpose) {
    case 'register':
      return {
        subject: say(`Your ${SHOP} sign-up code`, `আপনার ${SHOP} সাইন আপ কোড`),
        heading: say('Confirm your e-mail address', 'আপনার ই-মেইল ঠিকানা নিশ্চিত করুন'),
        lead: say(
          `Welcome to ${SHOP}! Enter this code on the sign-up page to finish creating your account.`,
          `${SHOP}-এ স্বাগতম! অ্যাকাউন্ট তৈরি শেষ করতে সাইন আপ পেজে এই কোডটি লিখুন।`
        ),
      };
    case 'reset':
      return {
        subject: say(`Your ${SHOP} password reset code`, `আপনার ${SHOP} পাসওয়ার্ড রিসেট কোড`),
        heading: say('Reset your password', 'পাসওয়ার্ড রিসেট করুন'),
        lead: say(
          'Enter this code on the password reset page to choose a new password.',
          'নতুন পাসওয়ার্ড বেছে নিতে পাসওয়ার্ড রিসেট পেজে এই কোডটি লিখুন।'
        ),
      };
    case 'signin':
      return {
        subject: say(`Your ${SHOP} sign-in code`, `আপনার ${SHOP} সাইন ইন কোড`),
        heading: say('Confirm it is you', 'নিশ্চিত করুন এটি আপনিই'),
        lead: say(
          'Your password was just entered on the sign-in page. Enter this code there to finish signing in.',
          'সাইন ইন পেজে এইমাত্র আপনার পাসওয়ার্ড দেওয়া হয়েছে। সাইন ইন শেষ করতে সেখানে এই কোডটি লিখুন।'
        ),
        ignore: say(
          "If this wasn't you, someone knows your password: reset it from the sign-in page. They cannot sign in without this code.",
          'এটি আপনি না হলে কেউ আপনার পাসওয়ার্ড জানে: সাইন ইন পেজ থেকে সেটি রিসেট করুন। এই কোড ছাড়া তারা সাইন ইন করতে পারবে না।'
        ),
      };
    case 'delete-account':
      return {
        subject: say(`Your ${SHOP} code to delete your account`, `আপনার ${SHOP} অ্যাকাউন্ট মুছে ফেলার কোড`),
        heading: say('Confirm deleting your account', 'অ্যাকাউন্ট মুছে ফেলা নিশ্চিত করুন'),
        lead: say(
          'You asked to delete your account. Enter this code on your profile to confirm. Deleting an account cannot be undone.',
          'আপনি অ্যাকাউন্ট মুছে ফেলতে চেয়েছেন। নিশ্চিত করতে প্রোফাইলে এই কোডটি লিখুন। মুছে ফেলা অ্যাকাউন্ট আর ফিরিয়ে আনা যায় না।'
        ),
        ignore: say(
          "If you didn't ask for this, you can ignore this e-mail - your account stays as it is.",
          'আপনি এটি না চেয়ে থাকলে এই ই-মেইল উপেক্ষা করতে পারেন - আপনার অ্যাকাউন্ট যেমন আছে তেমনই থাকবে।'
        ),
      };
    case 'two-factor-off':
      return {
        subject: say(`Your ${SHOP} code to turn off two-step sign-in`, `আপনার ${SHOP} টু-স্টেপ সাইন ইন বন্ধ করার কোড`),
        heading: say('Confirm turning off two-step sign-in', 'টু-স্টেপ সাইন ইন বন্ধ করা নিশ্চিত করুন'),
        lead: say(
          'You asked to turn off two-step sign-in. Enter this code on your profile to confirm.',
          'আপনি টু-স্টেপ সাইন ইন বন্ধ করতে চেয়েছেন। নিশ্চিত করতে প্রোফাইলে এই কোডটি লিখুন।'
        ),
        ignore: say(
          "If you didn't ask for this, you can ignore this e-mail - two-step sign-in stays on.",
          'আপনি এটি না চেয়ে থাকলে এই ই-মেইল উপেক্ষা করতে পারেন - টু-স্টেপ সাইন ইন চালু থাকবে।'
        ),
      };
    case 'email-change':
      return {
        subject: say(`Your ${SHOP} code to confirm your new e-mail address`, `আপনার নতুন ই-মেইল ঠিকানা নিশ্চিত করার ${SHOP} কোড`),
        heading: say('Confirm your new e-mail address', 'আপনার নতুন ই-মেইল ঠিকানা নিশ্চিত করুন'),
        lead: say(
          `You asked to move your ${SHOP} account to this address. Enter this code on your profile to confirm it.`,
          `আপনি আপনার ${SHOP} অ্যাকাউন্ট এই ঠিকানায় নিতে চেয়েছেন। নিশ্চিত করতে প্রোফাইলে এই কোডটি লিখুন।`
        ),
        ignore: say(
          "If you didn't ask for this, you can ignore this e-mail - nothing changes without the code.",
          'আপনি এটি না চেয়ে থাকলে এই ই-মেইল উপেক্ষা করতে পারেন - কোড ছাড়া কিছুই বদলাবে না।'
        ),
      };
  }
};

/** A one-time code: signing up, resetting a password, two-step sign-in, or confirming an account change. */
export const codeEmail = (purpose: CodePurpose, code: string): MailFor => (language) => {
  const copy = copyFor(purpose, language);
  const safeCode = escape(code);
  const say = (en: string, bn: string): string => inLanguage(language, en, bn);
  const mins = num(language, minutes);
  const defaultIgnore = say(
    "If you didn't ask for it, you can ignore this e-mail - nothing happens without the code.",
    'আপনি এটি না চেয়ে থাকলে এই ই-মেইল উপেক্ষা করতে পারেন - কোড ছাড়া কিছুই হবে না।'
  );

  const html = layout({
    language,
    heading: copy.heading,
    preheader: say(`Your code is ${code}. It expires in ${minutes} minutes.`, `আপনার কোড ${code}। এটি ${mins} মিনিট পর মেয়াদোত্তীর্ণ হবে।`),
    body: [
      paragraph(escape(copy.lead)),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
<tr><td align="center" style="background:${TINT};border:2px dashed #c4b5fd;border-radius:16px;padding:22px 12px;">
<div style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:${BRAND_DARK};padding-left:10px;">${safeCode}</div>
</td></tr>
</table>`,
      paragraph(
        say(
          `This code expires in <strong>${minutes} minutes</strong> and can be used once.`,
          `এই কোডটি <strong>${mins} মিনিট</strong> পর মেয়াদোত্তীর্ণ হবে এবং একবারই ব্যবহার করা যাবে।`
        )
      ),
      paragraph(
        say(
          `<strong>Never share it.</strong> ${SHOP} will never ask you for this code by phone, chat or e-mail.`,
          `<strong>কাউকে এটি জানাবেন না।</strong> ${SHOP} ফোন, চ্যাট বা ই-মেইলে কখনো এই কোড চাইবে না।`
        ),
        `font-size:14px;color:${MUTED};`
      ),
      paragraph(
        escape(copy.ignore ?? defaultIgnore),
        `font-size:14px;color:${MUTED};`
      ),
    ].join('\n'),
  });

  const text = [
    `${SHOP}: ${copy.heading}`,
    '',
    copy.lead,
    '',
    say(`Your code: ${code}`, `আপনার কোড: ${code}`),
    '',
    say(
      `It expires in ${minutes} minutes and can be used once.`,
      `এটি ${mins} মিনিট পর মেয়াদোত্তীর্ণ হবে এবং একবারই ব্যবহার করা যাবে।`
    ),
    say(
      `Never share it: ${SHOP} will never ask you for this code.`,
      `কাউকে এটি জানাবেন না: ${SHOP} কখনো আপনার কাছে এই কোড চাইবে না।`
    ),
    copy.ignore ?? say("If you didn't ask for it, you can ignore this e-mail.", 'আপনি এটি না চেয়ে থাকলে এই ই-মেইল উপেক্ষা করতে পারেন।'),
    '',
    textFooter(language),
  ].join('\n');

  return { subject: copy.subject, text, html };
};

/**
 * Somebody entered an address that already has an account on the sign-up
 * form. No code is issued; the owner is told, which is useful to them and
 * useless to whoever was checking whether the address is registered.
 */
export const alreadyRegisteredEmail = (): MailFor => (language) => {
  const url = siteUrl();
  const signIn = url ? `${url}/sign-in` : '';
  const say = (en: string, bn: string): string => inLanguage(language, en, bn);
  const heading = say('Someone tried to sign up with your address', 'কেউ আপনার ঠিকানা দিয়ে সাইন আপ করার চেষ্টা করেছে');

  const html = layout({
    language,
    heading,
    preheader: say('Nothing was created, and your account has not changed.', 'কিছু তৈরি হয়নি, আর আপনার অ্যাকাউন্টও বদলায়নি।'),
    body: [
      paragraph(say('Someone entered this e-mail address on our sign-up form.', 'কেউ আমাদের সাইন আপ ফর্মে এই ই-মেইল ঠিকানাটি দিয়েছে।')),
      paragraph(
        say(
          'This address already has an account, so <strong>nothing was created</strong> and no verification code was issued.',
          'এই ঠিকানায় আগে থেকেই একটি অ্যাকাউন্ট আছে, তাই <strong>কিছু তৈরি হয়নি</strong> এবং কোনো ভেরিফিকেশন কোডও পাঠানো হয়নি।'
        )
      ),
      signIn
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr><td bgcolor="${BRAND}" style="background:${BRAND};border-radius:999px;">
<a href="${escape(signIn)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${say(`Sign in to ${SHOP}`, `${SHOP}-এ সাইন ইন করুন`)}</a>
</td></tr></table>`
        : '',
      paragraph(
        say(
          'If that was you, sign in instead - or use "Forgot password" if you cannot remember it. If it was not you, you can ignore this message. <strong>Your account has not changed.</strong>',
          'এটি আপনি হলে বরং সাইন ইন করুন - পাসওয়ার্ড মনে না থাকলে "পাসওয়ার্ড ভুলে গেছেন" ব্যবহার করুন। আপনি না হলে এই বার্তা উপেক্ষা করতে পারেন। <strong>আপনার অ্যাকাউন্ট বদলায়নি।</strong>'
        ),
        `font-size:14px;color:${MUTED};`
      ),
    ].join('\n'),
  });

  const text = [
    ...say(
      'Someone entered this address on our sign-up form.\n\nThis address already has an account, so nothing was created and no\nverification code was issued.\n\nIf that was you, sign in instead - or use "Forgot password" if you cannot\nremember it. If it was not you, you can ignore this message. Your account\nhas not changed.',
      'কেউ আমাদের সাইন আপ ফর্মে এই ঠিকানাটি দিয়েছে।\n\nএই ঠিকানায় আগে থেকেই একটি অ্যাকাউন্ট আছে, তাই কিছু তৈরি হয়নি এবং\nকোনো ভেরিফিকেশন কোডও পাঠানো হয়নি।\n\nএটি আপনি হলে বরং সাইন ইন করুন - পাসওয়ার্ড মনে না থাকলে "পাসওয়ার্ড ভুলে গেছেন"\nব্যবহার করুন। আপনি না হলে এই বার্তা উপেক্ষা করতে পারেন। আপনার অ্যাকাউন্ট\nবদলায়নি।'
    ).split('\n'),
    ...(signIn ? ['', `${say('Sign in', 'সাইন ইন')}: ${signIn}`] : []),
    '',
    textFooter(language),
  ].join('\n');

  return { subject: heading, text, html };
};

// ---------------------------------------------------------------- notices
//
// Everything below shares one shape - a lead, an optional list of books, an
// optional set of facts, a button - so an order e-mail, a return decision and
// a message from the shop all look like the same shop.

/** A line of an order: the book, how many, what it came to. */
export interface NoticeItem {
  title: string;
  detail?: string;
  amount?: string;
}

export interface NoticeInput {
  subject: string;
  heading: string;
  preheader: string;
  /** Paragraphs before the details, as plain text. */
  lead: readonly string[];
  items?: readonly NoticeItem[];
  /** Label and value pairs: totals, an address, a reason. */
  facts?: readonly (readonly [string, string])[];
  /** A button to a page on the site, by path ("/order-tracking/ABC"). */
  button?: { label: string; path: string };
  /** Smaller paragraphs after everything else. */
  after?: readonly string[];
}

const TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';

/** Plain text as HTML: escaped, with its own line breaks kept. */
const textToHtml = (value: string): string => escape(value).replace(/\r?\n/g, '<br>');

export const noticeEmail = (input: NoticeInput, language: Language = 'en'): Email => {
  const url = siteUrl();
  const link = input.button && url ? `${url}${input.button.path}` : '';

  const items = input.items?.length
    ? `<table ${TABLE} style="margin:4px 0 20px;border:1px solid #ece8f7;border-radius:14px;">
${input.items
  .map(
    (item, index) => `<tr><td style="padding:12px 16px;${index ? 'border-top:1px solid #ece8f7;' : ''}font-family:${SANS};font-size:14px;color:${INK};">
<strong>${escape(item.title)}</strong>${item.detail ? `<br><span style="color:${MUTED};">${escape(item.detail)}</span>` : ''}
</td><td align="right" style="padding:12px 16px;${index ? 'border-top:1px solid #ece8f7;' : ''}font-family:${SANS};font-size:14px;font-weight:bold;color:${INK};white-space:nowrap;">${escape(item.amount ?? '')}</td></tr>`
  )
  .join('\n')}
</table>`
    : '';

  const facts = input.facts?.length
    ? `<table ${TABLE} style="margin:0 0 20px;background:${TINT};border-radius:14px;">
${input.facts
  .map(
    ([label, value]) => `<tr><td valign="top" style="padding:8px 16px;font-family:${SANS};font-size:13px;color:${MUTED};white-space:nowrap;">${escape(label)}</td><td style="padding:8px 16px;font-family:${SANS};font-size:14px;color:${INK};">${textToHtml(value)}</td></tr>`
  )
  .join('\n')}
</table>`
    : '';

  const button = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr><td bgcolor="${BRAND}" style="background:${BRAND};border-radius:999px;">
<a href="${escape(link)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape(input.button?.label ?? '')}</a>
</td></tr></table>`
    : '';

  const html = layout({
    language,
    heading: input.heading,
    preheader: input.preheader,
    body: [
      ...input.lead.map((line) => paragraph(textToHtml(line))),
      items,
      facts,
      button,
      ...(input.after ?? []).map((line) => paragraph(textToHtml(line), `font-size:14px;color:${MUTED};`)),
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const text = [
    `${SHOP}: ${input.heading}`,
    '',
    ...input.lead.flatMap((line) => [line, '']),
    ...(input.items?.length
      ? [...input.items.map((item) => `- ${item.title}${item.detail ? ` (${item.detail})` : ''}${item.amount ? `: ${item.amount}` : ''}`), '']
      : []),
    ...(input.facts?.length ? [...input.facts.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(link ? [`${input.button?.label}: ${link}`, ''] : []),
    ...(input.after ?? []).flatMap((line) => [line, '']),
    textFooter(language),
  ].join('\n');

  return { subject: input.subject, text, html };
};
