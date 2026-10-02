import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCookieBite, FaTimes } from 'react-icons/fa';

import { acceptAll, necessaryOnly, onOpenConsentSettings, saveConsent, useConsent, type ConsentCategory } from '../utils/consent.js';
import './ConsentBanner.css';

const CHOICES: readonly { id: ConsentCategory | 'necessary'; title: string; text: string }[] = [
  {
    id: 'necessary',
    title: 'Necessary',
    text: 'Keeps you signed in, keeps your account secure - including the security check on sign-in and sign-up - and remembers these choices. The site cannot work without these.',
  },
  {
    id: 'preferences',
    title: 'Preferences',
    text: 'Remembers light or dark mode, your voice search language, how lists are sorted and sized, and your recent searches.',
  },
  {
    id: 'personalisation',
    title: 'Personalisation',
    text: 'Remembers the books you looked at, for "Recently viewed" and "Top picks for you" on the homepage.',
  },
  {
    id: 'diagnostics',
    title: 'Error reports',
    text: 'Sends us a report when something breaks on a page, so we can fix it. No advertising, and nothing sold.',
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
              <FaCookieBite aria-hidden="true" /> Cookies and storage
            </h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => setCustomising(false)}>
              <FaTimes aria-hidden="true" />
            </button>
          </div>
          <p className="cb-lead">
            Choose what we may keep in your browser. You can change this at any time from the footer. See the{' '}
            <Link to="/privacy#cookies" onClick={() => setCustomising(false)}>
              privacy policy
            </Link>
            .
          </p>
          <ul className="cb-choices">
            {CHOICES.map((choice) => {
              const necessary = choice.id === 'necessary';
              const on = necessary ? true : draft[choice.id as ConsentCategory];
              return (
                <li key={choice.id}>
                  <div>
                    <strong>{choice.title}</strong>
                    <p>{choice.text}</p>
                  </div>
                  <label className={`cb-switch${necessary ? ' is-locked' : ''}`}>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={on}
                      disabled={necessary}
                      aria-label={necessary ? `${choice.title}: always on` : choice.title}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [choice.id]: event.target.checked }))
                      }
                    />
                    <span aria-hidden="true" />
                    {necessary && <small>Always on</small>}
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
              Save my choices
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                acceptAll();
                setCustomising(false);
              }}
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (consent) return null;

  return (
    <section className="cb-banner" role="region" aria-label="Cookies and storage">
      <span className="cb-icon" aria-hidden="true">
        <FaCookieBite />
      </span>
      <p>
        We use cookies and similar storage to keep you signed in and the shop secure. With your permission we also
        remember your preferences, personalise suggestions and receive error reports.{' '}
        <Link to="/privacy#cookies">How we use cookies</Link>
      </p>
      <div className="cb-actions">
        <button type="button" className="btn btn-primary" onClick={acceptAll}>
          Accept all
        </button>
        <button type="button" className="btn btn-ghost" onClick={necessaryOnly}>
          Necessary only
        </button>
        <button type="button" className="cb-link" onClick={() => setCustomising(true)}>
          Choose
        </button>
      </div>
    </section>
  );
}
