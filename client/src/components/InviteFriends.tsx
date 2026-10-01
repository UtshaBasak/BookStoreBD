import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { FaCheckCircle, FaClock, FaPaperPlane, FaUserFriends } from 'react-icons/fa';

import { useInvites, useSendInvites } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
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
      toast.warning('Add a friend’s e-mail address.');
      return;
    }
    if (wrong) {
      toast.warning(`"${wrong}" does not look like an e-mail address.`);
      return;
    }
    if (emails.length > MAX_AT_ONCE) {
      toast.warning(`Up to ${MAX_AT_ONCE} friends at a time.`);
      return;
    }
    try {
      const answer = await send({ emails, note: note.trim() || undefined });
      toast.success(answer.message);
      setTo('');
      setNote('');
    } catch (error) {
      toast.error(messageOf(error) || 'Could not send the invitations.');
    }
  };

  return (
    <section id="invite" className="card mt-6 w-full scroll-mt-24 p-5 text-left text-ink sm:p-6" aria-labelledby="invite-title">
      <h2 id="invite-title" className="mt-0 mb-1 flex items-center gap-2 text-lg">
        <FaUserFriends aria-hidden="true" className="text-brand" /> Invite friends
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        Know someone who loves books? We will e-mail them an invitation from you, with a link to join.
      </p>

      <form onSubmit={submit} className="if-form">
        <label>
          <span>Their e-mail addresses</span>
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
          <small>Up to {MAX_AT_ONCE} at a time, separated by commas.</small>
        </label>
        <label>
          <span>
            A note from you <small>(optional)</small>
          </span>
          <textarea
            className="field"
            name="invite-note"
            rows={2}
            maxLength={300}
            placeholder="I found loads of second-hand books here!"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="if-send">
          <button type="submit" className="btn btn-primary" disabled={isPending || data?.remainingToday === 0}>
            <FaPaperPlane aria-hidden="true" /> {isPending ? 'Sending...' : 'Send invitations'}
          </button>
          {data && <small>{data.remainingToday} left today</small>}
        </div>
      </form>

      {data && data.items.length > 0 && (
        <div className="if-sent">
          <h3>Invited</h3>
          <ul>
            {data.items.map((invite) => (
              <li key={invite.email}>
                <span className="if-email">{invite.email}</span>
                {invite.joined ? (
                  <span className="if-pill is-joined">
                    <FaCheckCircle aria-hidden="true" /> Joined
                  </span>
                ) : (
                  <span className="if-pill">
                    <FaClock aria-hidden="true" /> Invited{' '}
                    {new Date(invite.invitedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
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
