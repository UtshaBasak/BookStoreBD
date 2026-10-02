import { useState } from 'react';
import { FaLaptop } from 'react-icons/fa';

import type { ApiError, SignOutOthersResponse } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';

/**
 * Signing out of every other browser at once: for a phone that was lost, or a
 * shared computer someone forgot to sign out of. This one stays signed in.
 */
export default function SessionsSetting() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const signOutOthers = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/auth/logout-others`, { method: 'POST' });
      const data = (await res.json()) as SignOutOthersResponse | ApiError;
      if (!res.ok) toast.error(data.message || 'Could not sign out the other browsers.');
      else toast.success(data.message);
    } catch {
      toast.error('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="security" className="card mt-6 w-full scroll-mt-24 p-5 text-left text-ink sm:p-6" aria-labelledby="security-title">
      <h2 id="security-title" className="mt-0 mb-1 flex items-center gap-2 text-lg">
        <FaLaptop aria-hidden="true" className="text-brand" /> Where you&rsquo;re signed in
      </h2>
      <p className="m-0 text-sm text-ink-muted">
        We e-mail you when your account is used from a browser we haven&rsquo;t seen before. If that wasn&rsquo;t you,
        or you left yourself signed in somewhere, sign out everywhere else and change your password.
      </p>
      <div className="mt-4">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void signOutOthers()}>
          Sign out everywhere else
        </button>
      </div>
    </section>
  );
}
