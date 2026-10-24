import { Link } from 'react-router-dom';
import { FaCheckCircle, FaRegCircle } from 'react-icons/fa';

import type { OwnProfile } from '@shared/api.js';

import type { ProfileMode } from '../utils/profileMode.js';
import { formatNumber, t } from '../utils/language.js';
import './ProfileSetup.css';

interface Step {
  key: string;
  label: string;
  /** Why it is worth doing, in a few words. */
  why: string;
  done: boolean;
  to: string;
}

const filled = (value: unknown): boolean => value !== undefined && value !== null && String(value).trim() !== '';

/** What a complete profile has, for buying or for selling. */
const setupSteps = (profile: Partial<OwnProfile>, mode: ProfileMode): Step[] => {
  const edit = (field: string) => `/update-profile?mode=${mode}#${field}`;
  const steps: Step[] = [
    {
      key: 'photo',
      label: t('Add a profile picture', 'প্রোফাইল ছবি যোগ করুন'),
      why: t('so people recognise you', 'যাতে সবাই আপনাকে চিনতে পারে'),
      done: filled(profile.profilePicture),
      to: edit('up-picture'),
    },
    {
      key: 'phone',
      label: t('Add your phone number', 'ফোন নম্বর যোগ করুন'),
      why: t('for delivery updates', 'ডেলিভারির খবর পেতে'),
      done: filled(profile.phone),
      to: edit('up-phone'),
    },
    {
      key: 'address',
      label: t('Add your address', 'ঠিকানা যোগ করুন'),
      why: t('for a faster checkout', 'দ্রুত চেকআউটের জন্য'),
      done: filled(profile.address),
      to: edit('up-address'),
    },
    {
      key: 'banner',
      label: t(`Choose a ${mode} banner`, mode === 'seller' ? 'বিক্রেতার ব্যানার বেছে নিন' : 'ক্রেতার ব্যানার বেছে নিন'),
      why: t('to make your profile your own', 'প্রোফাইলকে নিজের মতো করে সাজাতে'),
      done: filled(mode === 'seller' ? profile.sellerBanner : profile.buyerBanner),
      to: edit('banners'),
    },
    {
      key: 'two-step',
      label: t('Turn on two-step sign-in', 'দুই ধাপের সাইন-ইন চালু করুন'),
      why: t('to keep your account safe', 'অ্যাকাউন্ট নিরাপদ রাখতে'),
      done: Boolean(profile.twoFactor),
      to: '/profile#two-step',
    },
  ];
  if (mode === 'seller') {
    steps.push({
      key: 'bkash',
      label: t('Add your bKash merchant number', 'বিকাশ মার্চেন্ট নম্বর যোগ করুন'),
      why: t('so we can pay you', 'যাতে আমরা আপনাকে টাকা পাঠাতে পারি'),
      done: filled(profile.bkashMerchant),
      to: edit('bkash'),
    });
  }
  return steps;
};

const encouragement = (percent: number, left: number, mode: ProfileMode): string => {
  if (percent >= 70)
    return t(
      `Almost there! ${left} more ${left === 1 ? 'step' : 'steps'} and your profile is complete.`,
      `প্রায় হয়ে গেছে! আর ${formatNumber(left)}টি ধাপ বাকি, তারপরই আপনার প্রোফাইল সম্পূর্ণ।`
    );
  if (percent >= 30)
    return mode === 'seller'
      ? t(
          'Good start! A complete profile helps buyers trust your shop.',
          'ভালো শুরু! পূর্ণ প্রোফাইল আপনার শপের ওপর ক্রেতাদের আস্থা বাড়ায়।'
        )
      : t(
          'Good start! A complete profile makes checkout quicker and helps sellers trust you.',
          'ভালো শুরু! পূর্ণ প্রোফাইল চেকআউট দ্রুত করে আর বিক্রেতাদের আস্থা বাড়ায়।'
        );
  return t(
    'Welcome! Set up your profile in a couple of minutes, and buying and selling get easier.',
    'স্বাগতম! কয়েক মিনিটে প্রোফাইল সাজিয়ে নিন, কেনাবেচা আরও সহজ হবে।'
  );
};

/**
 * How complete the profile is, as a bar and a checklist of what is left, each
 * a link straight to the field. Gone once everything is done.
 */
export default function ProfileSetup({ profile, mode }: { profile: Partial<OwnProfile>; mode: ProfileMode }) {
  const steps = setupSteps(profile, mode);
  const done = steps.filter((step) => step.done).length;
  const percent = Math.round((done / steps.length) * 100);
  if (percent === 100) return null;

  return (
    <section id="setup" className="card ps-card" aria-labelledby="ps-title">
      <div className="ps-head">
        <div>
          <h2 id="ps-title">{t('Finish setting up your profile', 'প্রোফাইল সাজানো শেষ করুন')}</h2>
          <p>{encouragement(percent, steps.length - done, mode)}</p>
        </div>
        <span className="ps-percent">{formatNumber(percent)}%</span>
      </div>
      <div
        className="ps-bar"
        role="progressbar"
        aria-label={t('Profile set-up', 'প্রোফাইল সাজানো')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="ps-steps">
        {steps.map((step) => (
          <li key={step.key} className={step.done ? 'is-done' : ''}>
            {step.done ? (
              <>
                <FaCheckCircle aria-hidden="true" className="ps-icon" />
                <span>
                  {step.label}
                  <span className="sr-only">{t(' - done', ' - হয়েছে')}</span>
                </span>
              </>
            ) : (
              <Link to={step.to}>
                <FaRegCircle aria-hidden="true" className="ps-icon" />
                <span>
                  {step.label} <small>{step.why}</small>
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
