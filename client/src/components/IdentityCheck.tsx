import { useState } from 'react';

import type { ApiError, ConfirmCodeRequest } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import type { Identity } from '../utils/identity.js';
import { t } from '../utils/language.js';

/**
 * The re-check before a change that cannot be undone, or that weakens the
 * account: the password, or - for an account made through Google, which has
 * no password of its own - a code e-mailed to the account's address.
 */
export default function IdentityCheck({
  id,
  action,
  passwordSet,
  label,
  value,
  onChange,
}: {
  id: string;
  action: ConfirmCodeRequest['action'];
  passwordSet: boolean;
  /** "to delete your account", "to turn it off" - in the language shown; it
   * goes before the verb in Bangla ("বন্ধ করতে"). */
  label: string;
  value: Identity;
  onChange: (value: Identity) => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState('');
  const [problem, setProblem] = useState('');

  if (passwordSet) {
    return (
      <>
        <label className="text-sm font-bold text-ink-soft" htmlFor={id}>
          {t(`Enter your password ${label}`, `${label} আপনার পাসওয়ার্ড দিন`)}
        </label>
        <input
          id={id}
          type="password"
          autoComplete="current-password"
          value={value.password}
          onChange={(event) => onChange({ ...value, password: event.target.value })}
          className="field sm:max-w-sm"
        />
      </>
    );
  }

  const sendCode = async () => {
    setSending(true);
    setProblem('');
    try {
      const res = await apiFetch(`${API_BASE_URL}/user/me/confirm-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action } satisfies ConfirmCodeRequest),
      });
      const data = (await res.json()) as ApiError;
      if (res.ok) setSent(data.message);
      else setProblem(data.message || t('Could not send a code.', 'কোড পাঠানো যায়নি।'));
    } catch {
      setProblem(t('Could not reach the server. Please try again.', 'সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।'));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <p className="m-0 text-sm text-ink-soft">
        {t(
          `Your account signs in with Google, so it has no password. We will e-mail you a code ${label}.`,
          `আপনার অ্যাকাউন্ট Google দিয়ে সাইন ইন করে, তাই এর কোনো পাসওয়ার্ড নেই। ${label} আমরা আপনাকে একটি কোড ই-মেইল করব।`
        )}
      </p>
      <div>
        <button type="button" className="btn btn-ghost" disabled={sending} onClick={() => void sendCode()}>
          {sending
            ? t('Sending…', 'পাঠানো হচ্ছে…')
            : sent
              ? t('Send another code', 'আরেকটি কোড পাঠান')
              : t('E-mail me a code', 'আমাকে কোড ই-মেইল করুন')}
        </button>
      </div>
      {(sent || problem) && (
        <p role="status" className="m-0 text-sm" style={{ color: problem ? 'var(--color-danger-ink)' : 'var(--color-success-dark)' }}>
          {problem || sent}
        </p>
      )}
      {sent && (
        <>
          <label className="text-sm font-bold text-ink-soft" htmlFor={id}>
            {t('The 6-digit code', '৬ সংখ্যার কোড')}
          </label>
          <input
            id={id}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={value.code}
            onChange={(event) => onChange({ ...value, code: event.target.value })}
            className="field sm:max-w-40"
          />
        </>
      )}
    </>
  );
}
