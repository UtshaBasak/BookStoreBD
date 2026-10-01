import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FaShieldAlt } from 'react-icons/fa';

import type { ApiError, TwoFactorRequest } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { isOwnProfile } from '../utils/profile.js';

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
  const [password, setPassword] = useState('');
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
        toast.error(data.message || 'Could not change two-step sign-in.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setConfirming(false);
      setPassword('');
      toast.success(data.message);
    } catch {
      toast.error('Could not reach the server. Please try again.');
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
            <FaShieldAlt aria-hidden="true" className="text-brand" /> Two-step sign-in
          </h2>
          <p className="m-0 text-sm text-ink-muted">
            {enabled
              ? `On. After your password, we e-mail a 6-digit code to ${profile.email} to finish signing in.`
              : 'Add a second step to signing in: a one-time code sent to your e-mail, so a password alone is not enough.'}
          </p>
        </div>
        <span
          className={`badge ${enabled ? 'bg-success/10 text-success-dark' : 'bg-brand-tint text-ink-muted'}`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </div>

      <div className="mt-4">
        {!enabled ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save({ enabled: true })}>
            Turn on two-step sign-in
          </button>
        ) : !confirming ? (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirming(true)}>
            Turn it off
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-bold text-ink-soft" htmlFor="two-step-password">
              Enter your password to turn it off
            </label>
            <input
              id="two-step-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field sm:max-w-sm"
            />
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || password.length === 0}
                onClick={() => void save({ enabled: false, password })}
              >
                Turn off
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setConfirming(false);
                  setPassword('');
                }}
              >
                Keep it on
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
