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
import { t } from '../utils/language.js';

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
        toast.error(failure.message || t('Could not prepare your data.', 'আপনার তথ্য তৈরি করা যায়নি।'));
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

      toast.success(t('Your data is downloading.', 'আপনার তথ্য ডাউনলোড হচ্ছে।'));
    } catch {
      toast.error(t('Could not reach the server. Please try again.', 'সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।'));
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
        toast.error(failure.message || t('Could not delete your account.', 'আপনার অ্যাকাউন্ট মুছে ফেলা যায়নি।'));
        return;
      }

      clearSession();
      toast.success(t('Your account has been deleted.', 'আপনার অ্যাকাউন্ট মুছে ফেলা হয়েছে।'));
      navigate('/');
    } catch {
      toast.error(t('Could not reach the server. Please try again.', 'সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-6 w-full p-5 text-left text-ink sm:p-6">
      <h2 className="mt-0 mb-1 text-lg">{t('Your data', 'আপনার তথ্য')}</h2>
      <p className="mb-4 text-sm text-ink-muted">
        {t(
          'Take a copy of everything this account holds, or close it for good.',
          'এই অ্যাকাউন্টে থাকা সব তথ্যের একটি কপি নিন, অথবা অ্যাকাউন্টটি চিরতরে বন্ধ করুন।'
        )}
      </p>

      <button
        type="button"
        onClick={downloadMyData}
        disabled={busy}
        className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t('Download my data', 'আমার তথ্য ডাউনলোড করুন')}
      </button>

      <hr className="my-5 border-0 border-t border-line" />

      <h3 className="mt-0 mb-1 text-base text-danger-dark">{t('Delete this account', 'এই অ্যাকাউন্ট মুছে ফেলুন')}</h3>
      <p className="mb-4 text-sm text-ink-muted">
        {t(
          'This cannot be undone. Your profile, listings, cart and wishlist are removed. Orders are kept as accounting records, and your messages stay in the other person\u2019s conversation \u2014 both with your details stripped out and shown as a deleted user.',
          'এটি আর ফেরানো যাবে না। আপনার প্রোফাইল, লিস্টিং, কার্ট ও উইশলিস্ট মুছে যাবে। হিসাবের রেকর্ড হিসেবে অর্ডারগুলো থেকে যাবে, আর আপনার বার্তা অন্যজনের কথোপকথনে থেকে যাবে \u2014 দুই ক্ষেত্রেই আপনার তথ্য সরিয়ে, মুছে ফেলা ব্যবহারকারী হিসেবে দেখানো হবে।'
        )}
      </p>
      <p className="mb-4 text-sm text-ink-muted">
        {t(
          'Orders not yet started are cancelled for you. An order on its way, a return being decided, or money still owed to you needs to finish first; we will say what.',
          'যে অর্ডারের কাজ শুরু হয়নি, সেগুলো আপনার হয়ে বাতিল হবে। পথে থাকা অর্ডার, সিদ্ধান্তের অপেক্ষায় থাকা রিটার্ন বা আপনার পাওনা টাকা আগে মিটতে হবে; কী বাকি, আমরা জানিয়ে দেব।'
        )}
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
          {t('Delete my account', 'আমার অ্যাকাউন্ট মুছে ফেলুন')}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* The password again, not just the button: this is irreversible, and
              a borrowed laptop should not be enough to do it. */}
          <IdentityCheck
            id="delete-password"
            action="delete-account"
            passwordSet={passwordSet}
            label={t('to confirm', 'নিশ্চিত করতে')}
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
              {t('Delete my account for good', 'আমার অ্যাকাউন্ট স্থায়ীভাবে মুছুন')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setIdentity(NO_IDENTITY);
              }}
              className="btn btn-ghost"
            >
              {t('Keep my account', 'অ্যাকাউন্ট রাখুন')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
