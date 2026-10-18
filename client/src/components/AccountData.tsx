import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { AccountBlockedResponse, ApiError } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { clearSession, getUserEmail } from '../utils/auth.js';
import { useProfile } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { isOwnProfile } from '../utils/profile.js';
import IdentityCheck from './IdentityCheck.js';
import { NO_IDENTITY, identityBody, identityGiven } from '../utils/identity.js';

/**
 * The two things every account owner is entitled to: a copy of their data, and
 * a way to close the account.
 *
 * On the profile page rather than in a settings menu, so both are easy to
 * find.
 */
export default function AccountData() {
  const navigate = useNavigate();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [identity, setIdentity] = useState(NO_IDENTITY);
  const [busy, setBusy] = useState(false);
  // What has to settle first, when the shop says the account cannot close yet.
  const [blocked, setBlocked] = useState<AccountBlockedResponse | null>(null);
  const email = getUserEmail();
  const { data: profile } = useProfile(email, { enabled: Boolean(email) });
  // An account made through Google confirms with an e-mailed code instead.
  const passwordSet = !isOwnProfile(profile) || profile.passwordSet !== false;

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
        body: JSON.stringify(identityBody(identity, passwordSet)),
      });

      if (!res.ok) {
        const failure = (await res.json()) as ApiError & Partial<AccountBlockedResponse>;
        if (failure.code === 'account-has-open-business' && failure.blockers) {
          setBlocked({ code: failure.code, message: failure.message, blockers: failure.blockers });
          return;
        }
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
      <p className="mb-4 text-sm text-ink-muted">
        Orders not yet started are cancelled for you. An order on its way, a return being
        decided, or money still owed to you needs to finish first; we will say what.
      </p>
      {blocked && (
        <div role="alert" className="pay-notice mb-4 text-sm">
          <p className="m-0 mb-1 font-bold">{blocked.message}</p>
          <ul className="m-0 pl-5">
            {blocked.blockers.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

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
          <IdentityCheck
            id="delete-password"
            action="delete-account"
            passwordSet={passwordSet}
            label="to confirm"
            value={identity}
            onChange={setIdentity}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={deleteMyAccount}
              disabled={busy || !identityGiven(identity, passwordSet)}
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
                setIdentity(NO_IDENTITY);
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
