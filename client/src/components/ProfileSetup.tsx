import { Link } from 'react-router-dom';
import { FaCheckCircle, FaRegCircle } from 'react-icons/fa';

import type { OwnProfile } from '@shared/api.js';

import type { ProfileMode } from '../utils/profileMode.js';
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
    { key: 'photo', label: 'Add a profile picture', why: 'so people recognise you', done: filled(profile.profilePicture), to: edit('up-picture') },
    { key: 'phone', label: 'Add your phone number', why: 'for delivery updates', done: filled(profile.phone), to: edit('up-phone') },
    { key: 'address', label: 'Add your address', why: 'for a faster checkout', done: filled(profile.address), to: edit('up-address') },
    { key: 'birthday', label: 'Add your date of birth', why: 'for suggestions that suit you', done: filled(profile.dateOfBirth), to: edit('up-dob') },
    {
      key: 'banner',
      label: `Choose a ${mode} banner`,
      why: 'to make your profile your own',
      done: filled(mode === 'seller' ? profile.sellerBanner : profile.buyerBanner),
      to: edit('banners'),
    },
    { key: 'two-step', label: 'Turn on two-step sign-in', why: 'to keep your account safe', done: Boolean(profile.twoFactor), to: '/profile#two-step' },
  ];
  if (mode === 'seller') {
    steps.push({ key: 'bkash', label: 'Add your bKash merchant number', why: 'so we can pay you', done: filled(profile.bkashMerchant), to: edit('bkash') });
  }
  return steps;
};

const encouragement = (percent: number, left: number, mode: ProfileMode): string => {
  if (percent >= 70) return `Almost there! ${left} more ${left === 1 ? 'step' : 'steps'} and your profile is complete.`;
  if (percent >= 30)
    return mode === 'seller'
      ? 'Good start! A complete profile helps buyers trust your shop.'
      : 'Good start! A complete profile makes checkout quicker and helps sellers trust you.';
  return 'Welcome! Set up your profile in a couple of minutes, and buying and selling get easier.';
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
          <h2 id="ps-title">Finish setting up your profile</h2>
          <p>{encouragement(percent, steps.length - done, mode)}</p>
        </div>
        <span className="ps-percent">{percent}%</span>
      </div>
      <div
        className="ps-bar"
        role="progressbar"
        aria-label="Profile set-up"
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
                  <span className="sr-only"> - done</span>
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
