import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCookieBite, FaTimes } from 'react-icons/fa';

import { acceptAll, necessaryOnly, onOpenConsentSettings, saveConsent, useConsent, type ConsentCategory } from '../utils/consent.js';
import { pick, t } from '../utils/language.js';
import './ConsentBanner.css';

/** A function, so each line is in the language being shown when it is drawn. */
const choices = (): readonly { id: ConsentCategory | 'necessary'; title: string; text: string; note?: string }[] => [
  {
    id: 'necessary',
    title: t('Necessary', 'প্রয়োজনীয়'),
    text: t(
      'Keeps you signed in, keeps your account secure - including the security check on sign-in and sign-up - and remembers these choices. The site cannot work without these.',
      'আপনাকে সাইন ইন রাখে, আপনার অ্যাকাউন্ট নিরাপদ রাখে - সাইন ইন ও সাইন আপের নিরাপত্তা যাচাইসহ - এবং এই পছন্দগুলো মনে রাখে। এগুলো ছাড়া সাইট চলে না।'
    ),
    note: t(
      'The language you choose is kept too, as part of the site working.',
      'আপনার বেছে নেওয়া ভাষাও রাখা হয়, সাইট চালানোরই অংশ হিসেবে।'
    ),
  },
  {
    id: 'preferences',
    title: t('Preferences', 'পছন্দ'),
    text: t(
      'Remembers light or dark mode, your voice search language, how lists are sorted and sized, and your recent searches.',
      'হালকা বা গাঢ় মোড, ভয়েস সার্চের ভাষা, তালিকা কীভাবে সাজানো ও কতটা বড়, আর আপনার সাম্প্রতিক খোঁজগুলো মনে রাখে।'
    ),
  },
  {
    id: 'personalisation',
    title: t('Personalisation', 'আপনার মতো করে সাজানো'),
    text: t(
      'Remembers the books you looked at, for "Recently viewed" and "Top picks for you" on the homepage.',
      'হোমপেজের "সম্প্রতি দেখা" ও "আপনার জন্য বাছাই"-এর জন্য আপনার দেখা বইগুলো মনে রাখে।'
    ),
  },
  {
    id: 'diagnostics',
    title: t('Error reports', 'ত্রুটির রিপোর্ট'),
    text: t(
      'Sends us a report when something breaks on a page, so we can fix it. No advertising, and nothing sold.',
      'কোনো পাতায় কিছু নষ্ট হলে আমাদের একটি রিপোর্ট পাঠায়, যাতে আমরা ঠিক করতে পারি। কোনো বিজ্ঞাপন নেই, কিছু বিক্রিও করা হয় না।'
    ),
  },
];

/**
 * What the site may keep in this browser: a banner until the visitor
 * chooses, with "Accept all", "Necessary only" and a choice per kind. The
 * footer and the privacy policy open the choices again.
 */
export default function ConsentBanner() {
  const consent = useConsent();
  const [customising, setCustomising] = useState(false);
  const [draft, setDraft] = useState({ preferences: true, personalisation: true, diagnostics: true });
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      onOpenConsentSettings(() => {
        setDraft({
          preferences: consent?.preferences ?? true,
          personalisation: consent?.personalisation ?? true,
          diagnostics: consent?.diagnostics ?? true,
        });
        setCustomising(true);
      }),
    [consent]
  );

  // Escape closes the choices; focus goes into them when they open.
  useEffect(() => {
    if (!customising) return undefined;
    dialog.current?.querySelector<HTMLElement>('input, button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCustomising(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customising]);

  if (customising) {
    return (
      <div className="cb-backdrop">
        <div ref={dialog} className="card cb-dialog" role="dialog" aria-modal="true" aria-labelledby="cb-title">
          <div className="cb-dialog-head">
            <h2 id="cb-title">
              <FaCookieBite aria-hidden="true" /> {t('Cookies and storage', 'কুকি ও স্টোরেজ')}
            </h2>
            <button type="button" className="icon-button" aria-label={t('Close', 'বন্ধ করুন')} onClick={() => setCustomising(false)}>
              <FaTimes aria-hidden="true" />
            </button>
          </div>
          <p className="cb-lead">
            {pick(
              <>
                Choose what we may keep in your browser. You can change this at any time from the footer. See the{' '}
                <Link to="/privacy#cookies" onClick={() => setCustomising(false)}>
                  privacy policy
                </Link>
                .
              </>,
              <>
                আপনার ব্রাউজারে আমরা কী রাখতে পারি, তা বেছে নিন। ফুটার থেকে যেকোনো সময় এটি বদলাতে পারবেন। দেখুন{' '}
                <Link to="/privacy#cookies" onClick={() => setCustomising(false)}>
                  গোপনীয়তা নীতি
                </Link>
                ।
              </>
            )}
          </p>
          <ul className="cb-choices">
            {choices().map((choice) => {
              const necessary = choice.id === 'necessary';
              const on = necessary ? true : draft[choice.id as ConsentCategory];
              return (
                <li key={choice.id}>
                  <div>
                    <strong>{choice.title}</strong>
                    <p>{choice.text}</p>
                    {choice.note && <p>{choice.note}</p>}
                  </div>
                  <label className={`cb-switch${necessary ? ' is-locked' : ''}`}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      disabled={necessary}
                      aria-label={necessary ? t(`${choice.title}: always on`, `${choice.title}: সব সময় চালু`) : choice.title}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [choice.id]: event.target.checked }))
                      }
                    />
                    <span aria-hidden="true" />
                    {necessary && <small>{t('Always on', 'সব সময় চালু')}</small>}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="cb-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                saveConsent(draft);
                setCustomising(false);
              }}
            >
              {t('Save my choices', 'আমার পছন্দ সংরক্ষণ করুন')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                acceptAll();
                setCustomising(false);
              }}
            >
              {t('Accept all', 'সব মেনে নিন')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (consent) return null;

  return (
    <section className="cb-banner" role="region" aria-label={t('Cookies and storage', 'কুকি ও স্টোরেজ')}>
      <span className="cb-icon" aria-hidden="true">
        <FaCookieBite />
      </span>
      <p>
        {pick(
          <>
            We use cookies and similar storage to keep you signed in and the shop secure. With your permission we also
            remember your preferences, personalise suggestions and receive error reports.{' '}
            <Link to="/privacy#cookies">How we use cookies</Link>
          </>,
          <>
            আপনাকে সাইন ইন রাখতে ও শপ নিরাপদ রাখতে আমরা কুকি ও এ ধরনের স্টোরেজ ব্যবহার করি। আপনার অনুমতি পেলে আপনার পছন্দ মনে
            রাখি, আপনার মতো করে বই সাজাই এবং ত্রুটির রিপোর্ট পাই।{' '}
            <Link to="/privacy#cookies">আমরা কীভাবে কুকি ব্যবহার করি</Link>
          </>
        )}
      </p>
      <div className="cb-actions">
        <button type="button" className="btn btn-primary" onClick={acceptAll}>
          {t('Accept all', 'সব মেনে নিন')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={necessaryOnly}>
          {t('Necessary only', 'শুধু প্রয়োজনীয়গুলো')}
        </button>
        <button type="button" className="cb-link" onClick={() => setCustomising(true)}>
          {t('Choose', 'বেছে নিন')}
        </button>
      </div>
    </section>
  );
}
