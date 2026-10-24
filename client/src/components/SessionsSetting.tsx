import { useState } from 'react';
import { FaLaptop } from 'react-icons/fa';

import type { ApiError, SignOutOthersResponse } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';
import { t } from '../utils/language.js';

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
      if (!res.ok) toast.error(data.message || t('Could not sign out the other browsers.', 'অন্য ব্রাউজারগুলো থেকে সাইন আউট করা যায়নি।'));
      else toast.success(data.message);
    } catch {
      toast.error(t('Could not reach the server. Please try again.', 'সার্ভারে পৌঁছানো যায়নি। আবার চেষ্টা করুন।'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="security" className="card mt-6 w-full scroll-mt-24 p-5 text-left text-ink sm:p-6" aria-labelledby="security-title">
      <h2 id="security-title" className="mt-0 mb-1 flex items-center gap-2 text-lg">
        <FaLaptop aria-hidden="true" className="text-brand" /> {t('Where you\u2019re signed in', 'যেখানে সাইন ইন আছেন')}
      </h2>
      <p className="m-0 text-sm text-ink-muted">
        {t(
          'We e-mail you when your account is used from a browser we haven\u2019t seen before. If that wasn\u2019t you, or you left yourself signed in somewhere, sign out everywhere else and change your password.',
          'আগে দেখা হয়নি এমন কোনো ব্রাউজার থেকে আপনার অ্যাকাউন্ট ব্যবহার হলে আমরা আপনাকে ই-মেইল করি। সেটি আপনি না হলে, বা কোথাও সাইন ইন রেখে এসে থাকলে, অন্য সব জায়গা থেকে সাইন আউট করে পাসওয়ার্ড বদলে নিন।'
        )}
      </p>
      <div className="mt-4">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void signOutOthers()}>
          {t('Sign out everywhere else', 'অন্য সব জায়গা থেকে সাইন আউট করুন')}
        </button>
      </div>
    </section>
  );
}
