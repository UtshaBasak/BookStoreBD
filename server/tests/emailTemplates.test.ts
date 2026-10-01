/**
 * The e-mails the shop sends: branded HTML with a plain-text twin that says
 * the same, so a code arrives looking like the shop and not like phishing.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { alreadyRegisteredEmail, codeEmail } from '../utils/emailTemplates.js';

afterEach(() => {
  delete process.env.RENDER_EXTERNAL_URL;
});

describe('a one-time code e-mail', () => {
  it('says what it is for, in the subject and the heading', () => {
    expect(codeEmail('register', '208915').subject).toBe('Your BookStoreBD sign-up code');
    expect(codeEmail('reset', '490870').subject).toBe('Your BookStoreBD password reset code');
    expect(codeEmail('reset', '490870').html).toContain('Reset your password');
  });

  it('shows the code as one run of digits, so it copies without spaces', () => {
    const { html } = codeEmail('register', '208915');

    expect(html).toContain('>208915<');
    expect(html).not.toMatch(/2\s+0\s+8\s+9\s+1\s+5/);
  });

  it('puts the code in the inbox preview, and says when it expires', () => {
    const { html, text } = codeEmail('register', '208915');

    expect(html).toMatch(/Your code is 208915\. It expires in 10 minutes\./);
    expect(text).toMatch(/expires in 10 minutes/);
  });

  it('has a plain-text part carrying the code for clients without HTML', () => {
    const { text } = codeEmail('register', '208915');

    // The first six-digit number is the code: nothing in the footer can be mistaken for one.
    expect(/\b(\d{6})\b/.exec(text)?.[1]).toBe('208915');
    expect(text).not.toContain('<');
  });

  it('links back to the site when it knows its address', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://bookstorebd-loum.onrender.com';

    expect(codeEmail('register', '208915').html).toContain('href="https://bookstorebd-loum.onrender.com"');
  });
});

describe('the notice that an address is already registered', () => {
  it('carries no code, and tells the owner nothing changed', () => {
    const { subject, text, html } = alreadyRegisteredEmail();

    expect(subject).toMatch(/tried to sign up/i);
    expect(/\b\d{6}\b/.test(text)).toBe(false);
    expect(html).toMatch(/nothing was created/);
  });

  it('offers a way to sign in when the site address is known', () => {
    process.env.RENDER_EXTERNAL_URL = 'https://bookstorebd-loum.onrender.com';

    expect(alreadyRegisteredEmail().html).toContain('https://bookstorebd-loum.onrender.com/sign-in');
  });
});
