import { useState, type FormEvent } from 'react';
import { FaBell, FaEnvelope, FaPaperPlane, FaSearch, FaTimes, FaUserPlus } from 'react-icons/fa';

import type { MessageAudience, MessageChannel } from '@shared/api.js';

import { useAudienceCount, useSendAdminMessage, useUsers } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import '../AdminPanel.css';

const CHANNELS: { value: MessageChannel; label: string; icon: typeof FaBell }[] = [
  { value: 'notification', label: 'Notification', icon: FaBell },
  { value: 'email', label: 'E-mail', icon: FaEnvelope },
  { value: 'both', label: 'Both', icon: FaPaperPlane },
];

const AUDIENCES: { value: MessageAudience; label: string; note: string }[] = [
  { value: 'all', label: 'Everyone', note: 'Every buyer and seller. Never administrators.' },
  { value: 'buyers', label: 'Buyers', note: 'Accounts without a seller payout number.' },
  { value: 'sellers', label: 'Sellers', note: 'Accounts set up to sell, with a bKash merchant number.' },
  { value: 'users', label: 'Chosen people', note: 'One or more accounts you pick below.' },
];

interface Person {
  email: string;
  username: string;
}

/**
 * The administrator's messages: a notification in people's bell, an e-mail
 * in the shop's design, or both - to chosen people, or to every buyer, every
 * seller or everyone. Administrators are never among the recipients.
 */
export default function AdminMessages() {
  const toast = useToast();
  const [channel, setChannel] = useState<MessageChannel>('notification');
  const [audience, setAudience] = useState<MessageAudience>('all');
  const [chosen, setChosen] = useState<Person[]>([]);
  const [find, setFind] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [confirming, setConfirming] = useState(false);

  const settled = useDebounced(find);
  const { data: found } = useUsers(
    { search: settled || undefined, page: 1, pageSize: 8 },
    { enabled: audience === 'users' && settled.trim().length >= 2 }
  );
  const { data: count } = useAudienceCount(audience);
  const { mutateAsync: send, isPending } = useSendAdminMessage();

  const reach = audience === 'users' ? chosen.length : (count?.recipients ?? 0);
  const linkOk = !link || /^\/(?!\/)/.test(link.trim());
  const ready = title.trim() && body.trim() && reach > 0 && linkOk;

  const add = (person: Person) =>
    setChosen((list) => (list.some((p) => p.email === person.email) ? list : [...list, person]));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      const result = await send({
        channel,
        audience,
        ...(audience === 'users' ? { emails: chosen.map((p) => p.email) } : {}),
        title: title.trim(),
        body: body.trim(),
        ...(link.trim() ? { link: link.trim() } : {}),
      });
      toast.success(result.message);
      setTitle('');
      setBody('');
      setLink('');
      setChosen([]);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not send the message.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaPaperPlane />
            </span>
            Messages
          </h2>
          <p className="admin-lede">
            Tell buyers and sellers something: a notification in their bell, an e-mail, or both.
          </p>
        </div>
      </header>

      <form className="admin-card am-form" onSubmit={(e) => void submit(e)}>
        <fieldset className="am-group">
          <legend>Send as</legend>
          <div className="am-chips">
            {CHANNELS.map(({ value, label, icon: Icon }) => (
              <label key={value} className={`chip${channel === value ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="channel"
                  value={value}
                  className="sr-only"
                  checked={channel === value}
                  onChange={() => {
                    setChannel(value);
                    setConfirming(false);
                  }}
                />
                <Icon aria-hidden="true" /> {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="am-group">
          <legend>To</legend>
          <div className="am-chips">
            {AUDIENCES.map(({ value, label }) => (
              <label key={value} className={`chip${audience === value ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="audience"
                  value={value}
                  className="sr-only"
                  checked={audience === value}
                  onChange={() => {
                    setAudience(value);
                    setConfirming(false);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="am-note">{AUDIENCES.find((a) => a.value === audience)?.note}</p>

          {audience === 'users' && (
            <div className="am-people">
              {chosen.length > 0 && (
                <ul className="am-chosen" aria-label="Chosen people">
                  {chosen.map((person) => (
                    <li key={person.email}>
                      <span>
                        <b>{person.username}</b> {person.email}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${person.username}`}
                        onClick={() => setChosen((list) => list.filter((p) => p.email !== person.email))}
                      >
                        <FaTimes aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="admin-search">
                <FaSearch className="admin-search-icon" aria-hidden="true" />
                <input
                  name="findPerson"
                  type="search"
                  className="field"
                  placeholder="Find someone by name or e-mail..."
                  aria-label="Find someone to add"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                />
              </div>
              {settled.trim().length >= 2 && (
                <ul className="am-found">
                  {(found?.items ?? []).map((user) => {
                    const picked = chosen.some((p) => p.email === user.email);
                    return (
                      <li key={user._id}>
                        <span>
                          <b>{user.username}</b> <span className="admin-cell-muted">{user.email}</span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost admin-btn-sm"
                          disabled={picked}
                          onClick={() => add({ email: user.email, username: user.username })}
                        >
                          <FaUserPlus aria-hidden="true" /> {picked ? 'Added' : 'Add'}
                        </button>
                      </li>
                    );
                  })}
                  {found && found.items.length === 0 && <li className="admin-cell-muted">Nobody matches.</li>}
                </ul>
              )}
            </div>
          )}
        </fieldset>

        <label className="am-field">
          <span>Title</span>
          <input
            name="title"
            className="field"
            maxLength={120}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setConfirming(false);
            }}
            placeholder="Eid sale: 20% off this weekend"
          />
        </label>
        <label className="am-field">
          <span>Message</span>
          <textarea
            name="body"
            className="field"
            rows={5}
            maxLength={3000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setConfirming(false);
            }}
            placeholder="Write what you want to tell them. A blank line starts a new paragraph in the e-mail."
          />
        </label>
        <label className="am-field">
          <span>
            Link <span className="admin-cell-muted">(optional, a page on this site)</span>
          </span>
          <input
            name="link"
            className="field"
            maxLength={300}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/filter?deals=1"
            aria-invalid={!linkOk}
          />
          {!linkOk && <small className="am-error">Start it with /, for a page on this site.</small>}
        </label>

        {(title || body) && (
          <div className="am-preview" aria-label="Preview">
            <span className="am-preview-icon" aria-hidden="true">
              📣
            </span>
            <span>
              <b>{title || 'Title'}</b>
              <span className="am-preview-body">{body || 'Message'}</span>
            </span>
          </div>
        )}

        <div className="am-send">
          <p className="am-reach">
            Reaches <b>{reach}</b> {reach === 1 ? 'person' : 'people'}
            {channel !== 'notification' && reach > 50 ? ' · e-mails to many people take a while to send' : ''}
          </p>
          {confirming && (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Change something
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!ready || isPending}>
            <FaPaperPlane aria-hidden="true" />
            {isPending ? 'Sending...' : confirming ? `Yes, send to ${reach}` : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
