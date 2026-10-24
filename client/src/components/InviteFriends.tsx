import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaPaperPlane, FaUserFriends } from 'react-icons/fa';

import { useInvites, useSendInvites } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { formatDate, formatNumber, t } from '../utils/language.js';
import './InviteFriends.css';

const MAX_AT_ONCE = 5;
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Addresses typed with commas, spaces or new lines between them. */
const addressesIn = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\s,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  ),
];

/**
 * Invite friends who are not members yet: an e-mail from the shop saying who
 * invited them and what BookStoreBD is, with a link to join. On the profile
 * page, with the invitations already sent and who has joined.
 */
export default function InviteFriends() {
  const toast = useToast();
  const { hash } = useLocation();
  const { data } = useInvites();
  const { mutateAsync: send, isPending } = useSendInvites();
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (data && hash === '#invite') document.getElementById('invite')?.scrollIntoView();
  }, [data, hash]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const emails = addressesIn(to);
    const wrong = emails.find((email) => !ADDRESS.test(email));
    if (!emails.length) {
      toast.warning(t('Add a friend’s e-mail address.', 'একজন বন্ধুর ই-মেইল ঠিকানা দিন।'));
      return;
    }
    if (wrong) {
      toast.warning(t(`"${wrong}" does not look like an e-mail address.`, `"${wrong}" ই-মেইল ঠিকানার মতো দেখাচ্ছে না।`));
      return;
    }
    if (emails.length > MAX_AT_ONCE) {
      toast.warning(t(`Up to ${MAX_AT_ONCE} friends at a time.`, `একবারে ${formatNumber(MAX_AT_ONCE)} জন পর্যন্ত বন্ধু।`));
      return;
    }
    try {
      const answer = await send({ emails, note: note.trim() || undefined });
      toast.success(answer.message);
      setTo('');
      setNote('');
    } catch (error) {
      toast.error(messageOf(error) || t('Could not send the invitations.', 'আমন্ত্রণ পাঠানো যায়নি।'));
    }
  };

  return (
    <section id="invite" className="card mt-6 w-full scroll-mt-24 p-5 text-left text-ink sm:p-6" aria-labelledby="invite-title">
      <h2 id="invite-title" className="mt-0 mb-1 flex items-center gap-2 text-lg">
        <FaUserFriends aria-hidden="true" className="text-brand" /> {t('Invite friends', 'বন্ধুদের আমন্ত্রণ জানান')}
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        {t(
          'Know someone who loves books? We will e-mail them an invitation from you, with a link to join.',
          'বই ভালোবাসেন এমন কাউকে চেনেন? আপনার পক্ষ থেকে আমরা তাঁকে যোগ দেওয়ার লিংকসহ একটি আমন্ত্রণ ই-মেইল করব।'
        )}
      </p>

      <form onSubmit={submit} className="if-form">
        <label>
          <span>{t('Their e-mail addresses', 'তাদের ই-মেইল ঠিকানা')}</span>
          <input
            className="field"
            name="invite-to"
            type="text"
            inputMode="email"
            autoComplete="off"
            placeholder="friend@example.com, another@example.com"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <small>
            {t(
              `Up to ${MAX_AT_ONCE} at a time, separated by commas.`,
              `একবারে ${formatNumber(MAX_AT_ONCE)}টি পর্যন্ত, কমা দিয়ে আলাদা করে।`
            )}
          </small>
        </label>
        <label>
          <span>
            {t('A note from you', 'আপনার একটি নোট')} <small>{t('(optional)', '(ঐচ্ছিক)')}</small>
          </span>
          <textarea
            className="field"
            name="invite-note"
            rows={2}
            maxLength={300}
            placeholder={t('I found loads of second-hand books here!', 'এখানে অনেক পুরোনো বই পেয়েছি!')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="if-send">
          <button type="submit" className="btn btn-primary" disabled={isPending || data?.remainingToday === 0}>
            <FaPaperPlane aria-hidden="true" /> {isPending ? t('Sending...', 'পাঠানো হচ্ছে...') : t('Send invitations', 'আমন্ত্রণ পাঠান')}
          </button>
          {data && <small>{t(`${data.remainingToday} left today`, `আজ আর ${formatNumber(data.remainingToday)}টি বাকি`)}</small>}
        </div>
      </form>

      {data && data.items.length > 0 && (
        <div className="if-sent">
          <h3>{t('Invited', 'আমন্ত্রিত')}</h3>
          <ul>
            {data.items.map((invite) => (
              <li key={invite.email}>
                <span className="if-email">{invite.email}</span>
                {invite.joined ? (
                  <span className="if-pill is-joined">
                    <FaCheckCircle aria-hidden="true" /> {t('Joined', 'যোগ দিয়েছেন')}
                  </span>
                ) : (
                  <span className="if-pill">
                    <FaClock aria-hidden="true" /> {t('Invited', 'আমন্ত্রণ')}{' '}
                    {formatDate(invite.invitedAt, { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
