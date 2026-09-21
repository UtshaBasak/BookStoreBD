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
    <section className="mt-6 w-full rounded-xl bg-white/95 p-4 text-left text-[#3b2f2f] sm:p-6">
      <h2 className="mb-1 text-lg font-bold">Your data</h2>
      <p className="mb-4 text-sm text-[#6b5d5d]">
        Take a copy of everything this account holds, or close it for good.
      </p>

      <button
        type="button"
        onClick={downloadMyData}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-white"
        style={{ background: '#8B6F6F', cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        Download my data
      </button>

      <hr className="my-5 border-[#e7ded9]" />

      <h3 className="mb-1 font-semibold text-[#c0392b]">Delete this account</h3>
      <p className="mb-3 text-sm text-[#6b5d5d]">
        This cannot be undone. Your listings, cart, wishlist and messages are removed.
        Orders are kept as accounting records with your personal details stripped out of
        them.
      </p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex min-h-[44px] items-center rounded-lg border px-4"
          style={{ borderColor: '#c0392b', color: '#c0392b', background: 'transparent' }}
        >
          Delete my account
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* The password again, not just the button: this is irreversible, and
              a borrowed laptop should not be enough to do it. */}
          <label className="text-sm font-medium" htmlFor="delete-password">
            Enter your password to confirm
          </label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-[#d9cfc9] px-3 sm:max-w-sm"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={deleteMyAccount}
              disabled={busy || password.length === 0}
              className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-white"
              style={{
                background: password.length === 0 ? '#d9a7a1' : '#c0392b',
                cursor: busy || password.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Delete my account for good
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setPassword('');
              }}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[#d9cfc9] px-4"
              style={{ background: 'transparent' }}
            >
              Keep my account
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
