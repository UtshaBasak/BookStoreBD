import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FaShieldAlt } from 'react-icons/fa';

import type { ApiError, TwoFactorRequest } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { isOwnProfile } from '../utils/profile.js';
import IdentityCheck from './IdentityCheck.js';
import { NO_IDENTITY, identityBody, identityGiven } from '../utils/identity.js';
import { t } from '../utils/language.js';

/**
 * Two-step sign-in, on or off. On takes one click; off asks for the password,
 * so an open session on a shared computer cannot remove the protection.
 */
export default function TwoStepSetting() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const email = getUserEmail();
  const { data: profile } = useProfile(email, { enabled: Boolean(email) });
  const enabled = isOwnProfile(profile) && Boolean(profile.twoFactor);

  const [confirming, setConfirming] = useState(false);
  const [identity, setIdentity] = useState(NO_IDENTITY);
  // An account made through Google confirms with an e-mailed code instead.
  const passwordSet = !isOwnProfile(profile) || profile.passwordSet !== false;
  const [busy, setBusy] = useState(false);

  const save = async (body: TwoFactorRequest) => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/user/me/two-factor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ApiError;
      if (!res.ok) {
        toast.error(data.message || t('Could not change two-step sign-in.', 'দুই ধাপের সাইন-ইন বদলানো যায়নি।'));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setConfirming(false);
      setIdentity(NO_IDENTITY);
      toast.success(data.message);
    } catch {
      toast.error(t('Could not reach the server. Please try again.', 'সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।'));
    } finally {
      setBusy(false);
    }
  };

  if (!isOwnProfile(profile)) return null;

  return (
    <section id="two-step" className="card mt-6 w-full scroll-mt-24 p-5 text-left text-ink sm:p-6" aria-labelledby="two-step-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 id="two-step-title" className="mt-0 mb-1 flex items-center gap-2 text-lg">
            <FaShieldAlt aria-hidden="true" className="text-brand" /> {t('Two-step sign-in', 'দুই ধাপের সাইন-ইন')}
          </h2>
          <p className="m-0 text-sm text-ink-muted">
            {enabled
              ? t(
                  `On. After your password, we e-mail a 6-digit code to ${profile.email} to finish signing in.`,
                  `চালু। পাসওয়ার্ডের পরে সাইন ইন শেষ করতে আমরা ${profile.email} ঠিকানায় ৬ সংখ্যার একটি কোড ই-মেইল করি।`
                )
              : t(
                  'Add a second step to signing in: a one-time code sent to your e-mail, so a password alone is not enough.',
                  'সাইন-ইনে দ্বিতীয় একটি ধাপ যোগ করুন: আপনার ই-মেইলে পাঠানো এককালীন কোড, যাতে শুধু পাসওয়ার্ডে কাজ না হয়।'
                )}
          </p>
        </div>
        <span
          className={`badge ${enabled ? 'bg-success/10 text-success-dark' : 'bg-brand-tint text-ink-muted'}`}
        >
          {enabled ? t('On', 'চালু') : t('Off', 'বন্ধ')}
        </span>
      </div>

      <div className="mt-4">
        {!enabled ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save({ enabled: true })}>
            {t('Turn on two-step sign-in', 'দুই ধাপের সাইন-ইন চালু করুন')}
          </button>
        ) : !confirming ? (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
            {t('Turn it off', 'বন্ধ করুন')}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <IdentityCheck
              id="two-step-password"
              action="two-factor-off"
              passwordSet={passwordSet}
              label={t('to turn it off', 'বন্ধ করতে')}
              value={identity}
              onChange={setIdentity}
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !identityGiven(identity, passwordSet)}
                onClick={() => void save({ enabled: false, ...identityBody(identity, passwordSet) })}
              >
                {t('Turn off', 'বন্ধ করুন')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirming(false);
                  setIdentity(NO_IDENTITY);
                }}
              >
                {t('Keep it on', 'চালু রাখুন')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
