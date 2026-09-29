/**
 * The e-mails the shop sends, as HTML with a plain-text twin.
 *
 * They were one line of plain text from a bare address - "Your OTP Code",
 * "Your verification code is: 208915" - which looks like the phishing it is
 * meant to protect against, and gave nobody a reason to trust it.
 *
 * Written for mail clients rather than browsers: tables for layout, every
 * style inline, no web fonts, no images to be blocked. The code is one run of
 * text spaced by CSS, so it copies as "208915" rather than "2 0 8 9 1 5".
 * The plain-text part carries everything the HTML does, for clients that show
 * no HTML and for anything that reads mail as text.
 */
import { OTP_TTL_MS } from './otpStore.js';

const SHOP = 'BookStoreBD';
const SUPPORT = 'support.utsha@gmail.com';
const PLACE = 'Dhaka, Bangladesh';

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

/** Only for our own fixed strings and digits, but escaped regardless. */
const escape = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const minutes = Math.round(OTP_TTL_MS / 60000);

/** The site's address, when known, for a link back to it. */
const siteUrl = (): string =>
  (process.env.PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');

/**
 * The frame every message shares: a coloured header with the shop's name and
 * what the message is, the body, and a footer saying who sent it and why.
 */
const layout = ({ heading, preheader, body }: { heading: string; preheader: string; body: string }): string => {
  const url = siteUrl();
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
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
Questions? Write to <a href="mailto:${SUPPORT}" style="color:${BRAND_DARK};">${SUPPORT}</a>${url ? ` &middot; <a href="${escape(url)}" style="color:${BRAND_DARK};">${escape(url.replace(/^https?:\/\//, ''))}</a>` : ''}<br>
&copy; ${year} ${SHOP}, ${PLACE}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
};

const paragraph = (html: string, extra = ''): string =>
  `<p style="margin:0 0 16px;${extra}">${html}</p>`;

const textFooter = (): string => {
  const url = siteUrl();
  return [`Questions? Write to ${SUPPORT}.`, url, `${SHOP}, ${PLACE}`].filter(Boolean).join('\n');
};

type CodePurpose = 'register' | 'reset';

const COPY: Record<CodePurpose, { subject: string; heading: string; lead: string }> = {
  register: {
    subject: `Your ${SHOP} sign-up code`,
    heading: 'Confirm your e-mail address',
    lead: `Welcome to ${SHOP}! Enter this code on the sign-up page to finish creating your account.`,
  },
  reset: {
    subject: `Your ${SHOP} password reset code`,
    heading: 'Reset your password',
    lead: 'Enter this code on the password reset page to choose a new password.',
  },
};

/** A one-time code for signing up or resetting a password. */
export const codeEmail = (purpose: CodePurpose, code: string): Email => {
  const copy = COPY[purpose];
  const safeCode = escape(code);

  const html = layout({
    heading: copy.heading,
    preheader: `Your code is ${code}. It expires in ${minutes} minutes.`,
    body: [
      paragraph(escape(copy.lead)),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
<tr><td align="center" style="background:${TINT};border:2px dashed #c4b5fd;border-radius:16px;padding:22px 12px;">
<div style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:${BRAND_DARK};padding-left:10px;">${safeCode}</div>
</td></tr>
</table>`,
      paragraph(`This code expires in <strong>${minutes} minutes</strong> and can be used once.`),
      paragraph(
        `<strong>Never share it.</strong> ${SHOP} will never ask you for this code by phone, chat or e-mail.`,
        `font-size:14px;color:${MUTED};`
      ),
      paragraph(
        "If you didn't ask for it, you can ignore this e-mail - nothing happens without the code.",
        `font-size:14px;color:${MUTED};`
      ),
    ].join('\n'),
  });

  const text = [
    `${SHOP}: ${copy.heading}`,
    '',
    copy.lead,
    '',
    `Your code: ${code}`,
    '',
    `It expires in ${minutes} minutes and can be used once.`,
    `Never share it: ${SHOP} will never ask you for this code.`,
    "If you didn't ask for it, you can ignore this e-mail.",
    '',
    textFooter(),
  ].join('\n');

  return { subject: copy.subject, text, html };
};

/**
 * Somebody entered an address that already has an account on the sign-up
 * form. No code is issued; the owner is told, which is useful to them and
 * useless to whoever was checking whether the address is registered.
 */
export const alreadyRegisteredEmail = (): Email => {
  const url = siteUrl();
  const signIn = url ? `${url}/sign-in` : '';

  const html = layout({
    heading: 'Someone tried to sign up with your address',
    preheader: 'Nothing was created, and your account has not changed.',
    body: [
      paragraph('Someone entered this e-mail address on our sign-up form.'),
      paragraph(
        'This address already has an account, so <strong>nothing was created</strong> and no verification code was issued.'
      ),
      signIn
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr><td bgcolor="${BRAND}" style="background:${BRAND};border-radius:999px;">
<a href="${escape(signIn)}" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Sign in to ${SHOP}</a>
</td></tr></table>`
        : '',
      paragraph(
        'If that was you, sign in instead - or use "Forgot password" if you cannot remember it. If it was not you, you can ignore this message. <strong>Your account has not changed.</strong>',
        `font-size:14px;color:${MUTED};`
      ),
    ].join('\n'),
  });

  const text = [
    'Someone entered this address on our sign-up form.',
    '',
    'This address already has an account, so nothing was created and no',
    'verification code was issued.',
    '',
    'If that was you, sign in instead - or use "Forgot password" if you cannot',
    'remember it. If it was not you, you can ignore this message. Your account',
    'has not changed.',
    ...(signIn ? ['', `Sign in: ${signIn}`] : []),
    '',
    textFooter(),
  ].join('\n');

  return { subject: 'Someone tried to sign up with your address', text, html };
};
