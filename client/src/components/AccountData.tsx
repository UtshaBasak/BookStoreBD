import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ApiError } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { clearSession } from '../utils/auth.js';
import { useToast } from '../hooks/useToast.js';

/**
 * The two things every account owner is entitled to: a copy of their data, and
 * a way out.
 *
 * On the profile page rather than buried in a settings menu, because a shop
 * that hides these looks like a shop with something to hide - and because an
 * account nobody can close is the kind of thing people complain about publicly
 * rather than by e-mail.
 */
export default function AccountData() {
  const navigate = useNavigate();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const downloadMyData = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/user/me/export`);
      if (!res.ok) {
        const failure = (await res.json()) as ApiError;
        toast.error(failure.message || 'Could not prepare your data.');
        return;
      }

      // Fetched rather than linked, because the request needs the access token
      // and a plain <a href> cannot carry one.
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bookstorebd-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success('Your data is downloading.');
    } catch {
      toast.error('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const deleteMyAccount = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/user/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const failure = (await res.json()) as ApiError;
        toast.error(failure.message || 'Could not delete your account.');
        return;
      }

      clearSession();
      toast.success('Your account has been deleted.');
      navigate('/');
    } catch {
      toast.error('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-6 w-full p-5 text-left text-ink sm:p-6">
      <h2 className="mt-0 mb-1 text-lg">Your data</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Take a copy of everything this account holds, or close it for good.
      </p>

      <button
        type="button"
        onClick={downloadMyData}
        disabled={busy}
        className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        Download my data
      </button>

      <hr className="my-5 border-0 border-t border-line" />

      <h3 className="mt-0 mb-1 text-base text-danger-dark">Delete this account</h3>
      <p className="mb-4 text-sm text-ink-muted">
        This cannot be undone. Your profile, listings, cart and wishlist are removed.
        Orders are kept as accounting records, and your messages stay in the other
        person&rsquo;s conversation &mdash; both with your details stripped out and shown
        as a deleted user.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="btn btn-danger"
        >
          Delete my account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* The password again, not just the button: this is irreversible, and
              a borrowed laptop should not be enough to do it. */}
          <label className="text-sm font-bold text-ink-soft" htmlFor="delete-password">
            Enter your password to confirm
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field sm:max-w-sm"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={deleteMyAccount}
              disabled={busy || password.length === 0}
              // Solid red once it can be pressed: the last, irreversible step
              // should not look like the harmless button that led to it.
              className="btn btn-danger disabled:cursor-not-allowed disabled:opacity-50 enabled:border-danger-dark enabled:bg-danger-dark enabled:text-white enabled:hover:bg-danger"
            >
              Delete my account for good
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setPassword('');
              }}
              className="btn btn-ghost"
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
