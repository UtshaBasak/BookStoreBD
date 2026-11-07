import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaCheck, FaEnvelope, FaFlag, FaListUl, FaRobot, FaSearch, FaTimes, FaTrashAlt } from 'react-icons/fa';

import type { Id, ModerationFlagDetail, ModerationFlagItem, ModerationReason, ModerationTarget } from '@shared/api.js';

import {
  useAssistantStats,
  useClearFlags,
  useDecideFlag,
  useDeleteListing,
  useModerationFlag,
  useModerationFlags,
  useModerationStats,
  useRemoveReview,
  useSendAdminMessage,
} from '../../hooks/queries.js';
import { useToast } from '../../hooks/useToast.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { FilterSelect, RefreshButton } from './AdminControls.js';
import { formatDateTime, formatNumber, t } from '../../utils/language.js';
import { messageOf, statusOf } from '../../utils/apiError.js';
import { timeAgo } from '../../utils/notificationLook.js';
import Pager from '../../components/Pager.js';
import '../AdminPanel.css';
import './SystemFlags.css';

const PAGE_SIZE = 25;

const TYPE_NAME = (type: ModerationTarget): string =>
  ({
    review: t('Book review', 'বইয়ের রিভিউ'),
    'seller-review': t('Seller rating', 'বিক্রেতার রেটিং'),
    listing: t('Listing', 'বইয়ের তালিকা'),
    chat: t('Chat', 'চ্যাট'),
  })[type];

const STATUSES = () => [
  { value: 'open', label: t('Open', 'খোলা') },
  { value: 'cleared', label: t('Looked fine', 'ঠিক আছে') },
  { value: 'actioned', label: t('Acted on', 'ব্যবস্থা নেওয়া') },
  { value: 'all', label: t('All', 'সব') },
];
const TYPES = () => [
  { value: '', label: t('Any type', 'যেকোনো ধরন') },
  { value: 'review', label: TYPE_NAME('review') },
  { value: 'seller-review', label: TYPE_NAME('seller-review') },
  { value: 'listing', label: TYPE_NAME('listing') },
  { value: 'chat', label: TYPE_NAME('chat') },
];
const SOURCES = () => [
  { value: '', label: t('Any source', 'যেকোনো উৎস') },
  { value: 'rule', label: t('Rule', 'নিয়ম') },
  { value: 'model', label: t('Model', 'মডেল') },
];
const SEVERITIES = () => [
  { value: '', label: t('Any severity', 'যেকোনো মাত্রা') },
  { value: 'high', label: t('High', 'বেশি') },
  { value: 'medium', label: t('Medium', 'মাঝারি') },
  { value: 'low', label: t('Low', 'কম') },
];
const SORTS = () => [
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
  { value: 'score', label: t('Highest score', 'সর্বোচ্চ স্কোর আগে') },
];
const SEVERITY_NAME = (value: string): string => SEVERITIES().find((s) => s.value === value)?.label ?? value;

const percent = (value: number): string => `${formatNumber(Math.round(value * 100))}%`;

/** Only a path on this site becomes a link; anything else is not shown as one. */
const safeLink = (link: string | null | undefined): string | null =>
  link && /^\/(?![/\\])/.test(link) ? link : null;

const MODE_TEXT = (mode: 'off' | 'shadow' | 'on'): string =>
  ({
    off: t('Automatic checks are off. Nothing new is being flagged.', 'স্বয়ংক্রিয় যাচাই বন্ধ। নতুন কিছু ফ্ল্যাগ হচ্ছে না।'),
    shadow: t(
      'Trial mode: checks run and record flags, but the live queue stays empty until the mode is switched on.',
      'পরীক্ষামূলক অবস্থা: যাচাই চলছে ও ফ্ল্যাগ জমছে, তবে চালু না করা পর্যন্ত মূল তালিকা ফাঁকা থাকে।'
    ),
    on: t(
      'Checks are on. A flag only asks you to take a look; nothing is hidden or removed until you decide.',
      'যাচাই চালু। ফ্ল্যাগ শুধু আপনাকে দেখতে বলে; আপনি সিদ্ধান্ত না নেওয়া পর্যন্ত কিছু লুকানো বা সরানো হয় না।'
    ),
  })[mode];

function ReasonChip({ reason }: { reason: ModerationReason }) {
  const Icon = reason.source === 'model' ? FaRobot : FaListUl;
  return (
    <li className="sf-chip" title={reason.detail}>
      <Icon aria-hidden="true" />
      <span>{reason.code}</span>
      <span className="admin-cell-muted">
        {reason.source === 'model' ? t('model', 'মডেল') : t('rule', 'নিয়ম')} · {percent(reason.score)}
      </span>
      <span className="sf-sr">{reason.detail}</span>
    </li>
  );
}

function ContentLink({ flag }: { flag: ModerationFlagItem }) {
  if (!flag.exists) return <span className="badge admin-status is-bad">{t('Content removed', 'কনটেন্ট সরানো হয়েছে')}</span>;
  const to = safeLink(flag.link);
  return to ? <Link to={to}>{t('View on the site', 'সাইটে দেখুন')}</Link> : null;
}

/** The drawer for one flag: the content in context, and the three things an administrator can do. */
function FlagDrawer({ id, onClose }: { id: Id; onClose: () => void }) {
  const query = useModerationFlag(id);
  const flag = query.data;
  const toast = useToast();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'view' | 'remove' | 'message'>('view');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [stillThere, setStillThere] = useState(false);

  const { mutateAsync: decide } = useDecideFlag();
  const { mutateAsync: removeReview } = useRemoveReview('book');
  const { mutateAsync: removeRating } = useRemoveReview('seller');
  const { mutateAsync: removeListing } = useDeleteListing();
  const { mutateAsync: send } = useSendAdminMessage();

  // Focus moves into the drawer, and back to where it was when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    return () => before?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = (message: string) => {
    toast.success(message);
    onClose();
  };
  const withNote = note.trim() ? { note: note.trim() } : {};

  const looksFine = async () => {
    setBusy(true);
    try {
      await decide({ id, decision: 'cleared', ...withNote });
      done(t('Marked as fine.', 'ঠিক আছে বলে চিহ্নিত হয়েছে।'));
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (detail: ModerationFlagDetail) => {
    if (!reason.trim()) return;
    setBusy(true);
    setStillThere(false);
    try {
      // The content's own delete first; chat is deleted by the server with the decision.
      if (detail.exists && detail.targetType !== 'chat') {
        if (detail.targetType === 'listing') {
          await removeListing(detail.targetId);
        } else if (!detail.subjectId) {
          throw new Error(t('Could not tell what this review belongs to.', 'রিভিউটি কিসের, তা জানা যায়নি।'));
        } else if (detail.targetType === 'review') {
          await removeReview({ targetId: detail.subjectId, reviewerEmail: detail.authorEmail });
        } else {
          await removeRating({ targetId: detail.subjectId, reviewerEmail: detail.authorEmail });
        }
      }
      await decide({ id, decision: 'removed', reason: reason.trim(), ...withNote });
      done(t('Removed, and the author was told why.', 'সরানো হয়েছে, আর লেখককে কারণ জানানো হয়েছে।'));
    } catch (error) {
      if (statusOf(error) === 409) {
        setStillThere(true);
        toast.error(t('The content is still there. Remove it first.', 'কনটেন্টটি এখনো আছে। আগে সেটি সরান।'));
      } else {
        toast.error(messageOf(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const message = async (detail: ModerationFlagDetail, event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      await send({ channel: 'both', audience: 'users', emails: [detail.authorEmail], title: title.trim(), body: body.trim() });
      await decide({ id, decision: 'messaged', ...withNote });
      done(t('Message sent to the author.', 'লেখককে বার্তা পাঠানো হয়েছে।'));
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sf-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="sf-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t('Flag details', 'ফ্ল্যাগের বিবরণ')}
        tabIndex={-1}
        ref={drawerRef}
      >
        <div className="sf-drawer-head">
          <h3>{flag ? flag.label || TYPE_NAME(flag.targetType) : t('Loading...', 'লোড হচ্ছে...')}</h3>
          <button type="button" className="btn btn-ghost admin-btn-sm" onClick={onClose} aria-label={t('Close', 'বন্ধ করুন')}>
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        {query.isPending ? (
          <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>
        ) : query.error || !flag ? (
          <div className="admin-alert">{t('Error:', 'ত্রুটি:')} {query.error?.message}</div>
        ) : (
          <>
            <p className="sf-note">
              {TYPE_NAME(flag.targetType)} · {flag.authorEmail} · {timeAgo(flag.createdAt)}
            </p>
            <div>
              <ContentLink flag={flag} />
            </div>

            {flag.targetType === 'chat' ? (
              <>
                <p className="sf-audit" role="note">
                  {t(
                    'Viewing these private messages is recorded in the audit log.',
                    'এই ব্যক্তিগত বার্তাগুলো দেখা অডিট লগে লেখা থাকে।'
                  )}
                </p>
                <ul className="sf-msgs">
                  {flag.messages.length === 0 && <li>{t('The messages are gone.', 'বার্তাগুলো আর নেই।')}</li>}
                  {flag.messages.map((m) => (
                    <li key={m._id}>
                      <div className="admin-cell-muted">
                        {t('To', 'প্রাপক')} {m.receiver} · {formatDateTime(m.timestamp)}
                      </div>
                      <div>{m.message}</div>
                      {m.hasImage && <em className="admin-cell-muted">{t('(with a picture)', '(ছবিসহ)')}</em>}
                    </li>
                  ))}
                </ul>
              </>
            ) : flag.content ? (
              <div className="sf-content">
                {flag.content.title && <p><strong>{flag.content.title}</strong></p>}
                {flag.content.rating !== null && (
                  <p>{t('Rating', 'রেটিং')}: {formatNumber(flag.content.rating)} / {formatNumber(5)}</p>
                )}
                {flag.content.price !== null && <p>{t('Price', 'দাম')}: ৳{formatNumber(flag.content.price)}</p>}
                {flag.content.body && <p>{flag.content.body}</p>}
              </div>
            ) : (
              <p className="sf-note">{t('The content is gone.', 'কনটেন্টটি আর নেই।')}</p>
            )}

            <div>
              <strong>{t('Why it was flagged', 'কেন ফ্ল্যাগ হয়েছে')}</strong>
              <ul className="sf-chips" aria-label={t('Reasons', 'কারণ')}>
                {flag.reasons.map((r) => (
                  <ReasonChip key={`${r.source}-${r.code}`} reason={r} />
                ))}
              </ul>
              <p className="sf-note">
                {t(
                  'These are automatic signals, not a finding. Please judge it yourself.',
                  'এগুলো স্বয়ংক্রিয় ইঙ্গিত, কোনো প্রমাণ নয়। নিজে বিচার করুন।'
                )}
              </p>
            </div>

            {flag.status !== 'open' ? (
              <p className="sf-note">
                {t('Already decided', 'সিদ্ধান্ত নেওয়া হয়েছে')}: {flag.decision ?? flag.status}
                {flag.note ? ` · ${flag.note}` : ''}
              </p>
            ) : mode === 'view' ? (
              <div className="sf-form">
                <label>
                  {t('Note (for administrators only)', 'নোট (শুধু অ্যাডমিনদের জন্য)')}
                  <textarea name="note" className="field" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div className="sf-actions">
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void looksFine()}>
                    <FaCheck aria-hidden="true" />
                    {t('Looks fine', 'ঠিক আছে')}
                  </button>
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setMode('remove')}>
                    <FaTrashAlt aria-hidden="true" />
                    {t('Remove', 'সরান')}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode('message')}>
                    <FaEnvelope aria-hidden="true" />
                    {t('Message the author', 'লেখককে বার্তা দিন')}
                  </button>
                </div>
              </div>
            ) : mode === 'remove' ? (
              <form
                className="sf-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void remove(flag);
                }}
              >
                <label>
                  {t('Reason, shown to the author', 'কারণ, লেখককে দেখানো হবে')}
                  <textarea name="reason" className="field" rows={3} maxLength={500} required value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                {stillThere && (
                  <p className="admin-alert" role="alert">
                    {t('The content is still there. Remove it first, then record the decision.', 'কনটেন্টটি এখনো আছে। আগে সরান, তারপর সিদ্ধান্ত লিখুন।')}
                  </p>
                )}
                <div className="sf-actions">
                  <button type="submit" className="btn btn-danger" disabled={busy || !reason.trim()}>
                    <FaTrashAlt aria-hidden="true" />
                    {t('Remove and tell the author', 'সরান ও লেখককে জানান')}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode('view')}>
                    {t('Back', 'ফিরে যান')}
                  </button>
                </div>
              </form>
            ) : (
              <form className="sf-form" onSubmit={(e) => void message(flag, e)}>
                <label>
                  {t('Title', 'শিরোনাম')}
                  <input name="title" className="field" maxLength={120} required value={title} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  {t('Message', 'বার্তা')}
                  <textarea name="body" className="field" rows={4} maxLength={2000} required value={body} onChange={(e) => setBody(e.target.value)} />
                </label>
                <div className="sf-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !body.trim()}>
                    <FaEnvelope aria-hidden="true" />
                    {t('Send to the author', 'লেখককে পাঠান')}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setMode('view')}>
                    {t('Back', 'ফিরে যান')}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RuleTable() {
  const stats = useModerationStats();
  const rules = stats.data?.rules ?? [];
  return (
    <section className="admin-card sf-section" aria-labelledby="sf-rules">
      <h3 id="sf-rules">{t('Rule precision', 'নিয়মের নির্ভুলতা')}</h3>
      <p className="sf-note">
        {t(
          'Low precision means admins mostly clear what the rule flags: raise its threshold, or switch it off with MODERATION_DISABLED_RULES.',
          'নির্ভুলতা কম মানে অ্যাডমিনরা প্রায়ই ফ্ল্যাগ ঠিক আছে বলে ছাড়েন: সীমা বাড়ান, অথবা MODERATION_DISABLED_RULES দিয়ে নিয়মটি বন্ধ করুন।'
        )}
      </p>
      {rules.length === 0 ? (
        <p className="sf-note">{t('No rule has flagged anything yet.', 'এখনো কোনো নিয়ম কিছু ফ্ল্যাগ করেনি।')}</p>
      ) : (
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>{t('Rule', 'নিয়ম')}</th>
                <th className="admin-num">{t('Open', 'খোলা')}</th>
                <th className="admin-num">{t('Acted on', 'ব্যবস্থা')}</th>
                <th className="admin-num">{t('Cleared', 'ঠিক আছে')}</th>
                <th className="admin-num">{t('Precision', 'নির্ভুলতা')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.code}>
                  <td className="admin-mono">{rule.code}</td>
                  <td className="admin-num">{formatNumber(rule.open)}</td>
                  <td className="admin-num">{formatNumber(rule.actioned)}</td>
                  <td className="admin-num">{formatNumber(rule.cleared)}</td>
                  <td className="admin-num">{rule.precision === null ? '—' : percent(rule.precision)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AssistantUsage() {
  const query = useAssistantStats();
  const data = query.data;
  const totals = data?.totals;
  const rated = totals ? totals.helpful + totals.unhelpful : 0;
  return (
    <section className="admin-card sf-section" aria-labelledby="sf-assistant">
      <h3 id="sf-assistant">{t('Shopping assistant', 'শপিং সহকারী')}</h3>
      {query.isPending ? (
        <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>
      ) : query.error || !data || !totals ? (
        <div className="admin-alert">{t('Error:', 'ত্রুটি:')} {query.error?.message}</div>
      ) : (
        <>
          <p className="sf-note">
            {data.enabled
              ? t('The assistant is on. Last 30 days:', 'সহকারী চালু। গত ৩০ দিন:')
              : t('The assistant is off. Last 30 days:', 'সহকারী বন্ধ। গত ৩০ দিন:')}
          </p>
          <dl className="sf-usage">
            <div><dt>{t('Questions', 'প্রশ্ন')}</dt><dd>{formatNumber(totals.questions)}</dd></div>
            <div><dt>{t('Answered without AI', 'এআই ছাড়া উত্তর')}</dt><dd>{formatNumber(totals.fallbacks)}</dd></div>
            <div><dt>{t('Handed to a person', 'মানুষের কাছে পাঠানো')}</dt><dd>{formatNumber(totals.handovers)}</dd></div>
            <div><dt>{t('Off-topic', 'বিষয়ের বাইরে')}</dt><dd>{formatNumber(totals.outOfScope)}</dd></div>
            <div>
              <dt>{t('Helpful / not helpful', 'কাজে লেগেছে / লাগেনি')}</dt>
              <dd>
                {formatNumber(totals.helpful)} / {formatNumber(totals.unhelpful)}
                {rated > 0 && <small className="admin-cell-muted"> ({percent(totals.helpful / rated)})</small>}
              </dd>
            </div>
            <div>
              <dt>{t('Gemini calls today', 'আজকের জেমিনি কল')}</dt>
              <dd>
                {formatNumber(data.geminiToday.assistant + data.geminiToday.moderation)} / {formatNumber(data.geminiToday.limit)}
              </dd>
            </div>
          </dl>
          <p className="sf-note">
            {t('Today: assistant', 'আজ: সহকারী')} {formatNumber(data.geminiToday.assistant)}, {t('moderation', 'যাচাই')}{' '}
            {formatNumber(data.geminiToday.moderation)}.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * What the automatic checks flagged. A flag is a reason to look, not a verdict:
 * nothing is hidden, and nothing is removed until an administrator decides.
 */
export default function SystemFlags() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'open';
  const type = params.get('type') ?? '';
  const source = params.get('source') ?? '';
  const severity = params.get('severity') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const shadow = params.get('shadow') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('q') ?? '';
  const settled = useDebounced(search);
  const [selected, setSelected] = useState<Id[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [openId, setOpenId] = useState<Id | null>(null);
  const toast = useToast();

  const setParam = (name: string, value: string) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== 'page') next.delete('page');
        return next;
      },
      { replace: true }
    );
    setSelected([]);
    setConfirming(false);
  };

  const query = useModerationFlags({
    status,
    type,
    source,
    severity,
    shadow,
    search: settled,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  const stats = useModerationStats();
  const { mutateAsync: clear, isPending: clearing } = useClearFlags();

  const items = query.data?.items ?? [];
  const mode = query.data?.mode ?? stats.data?.mode;
  const filtered = Boolean(settled || type || source || severity);
  const openTotal = stats.data ? Object.values(stats.data.open).reduce((a, b) => a + b, 0) : null;

  const toggle = (id: Id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const clearSelected = async () => {
    try {
      const result = await clear({ ids: selected });
      toast.success(t(`Cleared ${result.cleared} flag(s).`, `${formatNumber(result.cleared)}টি ফ্ল্যাগ ছাড়া হয়েছে।`));
      setSelected([]);
      setConfirming(false);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not clear those flags.', 'ফ্ল্যাগগুলো ছাড়া যায়নি।'));
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaFlag />
            </span>
            {t('Flagged by system', 'সিস্টেমের ফ্ল্যাগ')}
          </h2>
          <p className="admin-lede">{mode ? MODE_TEXT(mode) : ''}</p>
          {openTotal !== null && (
            <p className="sf-note">
              {t('Open now', 'এখন খোলা')}: {formatNumber(openTotal)}
            </p>
          )}
        </div>
        <RefreshButton onClick={() => void query.refetch()} busy={query.isFetching} />
      </header>

      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input
            name="q"
            type="text"
            className="field"
            placeholder={t('Search e-mail or text...', 'ইমেইল বা লেখা দিয়ে খুঁজুন...')}
            aria-label={t('Search flags', 'ফ্ল্যাগ খুঁজুন')}
            value={search}
            onChange={(e) => setParam('q', e.target.value)}
          />
        </div>
        <FilterSelect name="status" label={t('Status', 'অবস্থা')} value={status} onChange={(v) => setParam('status', v)} options={STATUSES()} />
        <FilterSelect name="type" label={t('Type', 'ধরন')} value={type} onChange={(v) => setParam('type', v)} options={TYPES()} />
        <FilterSelect name="source" label={t('Source', 'উৎস')} value={source} onChange={(v) => setParam('source', v)} options={SOURCES()} />
        <FilterSelect name="severity" label={t('Severity', 'মাত্রা')} value={severity} onChange={(v) => setParam('severity', v)} options={SEVERITIES()} />
        <FilterSelect name="sort" label={t('Sort', 'সাজান')} value={sort} onChange={(v) => setParam('sort', v)} options={SORTS()} />
        {mode === 'shadow' && (
          <label className="sf-switch">
            <input type="checkbox" checked={shadow} onChange={(e) => setParam('shadow', e.target.checked ? '1' : '')} />
            {t('Show trial flags', 'পরীক্ষামূলক ফ্ল্যাগ দেখান')}
          </label>
        )}
      </div>

      {selected.length > 0 && (
        <div className="admin-card sf-bulk" role="region" aria-label={t('Selected flags', 'বাছাই করা ফ্ল্যাগ')}>
          <span>{t(`${selected.length} selected`, `${formatNumber(selected.length)}টি বাছাই`)}</span>
          {confirming ? (
            <>
              <span>{t(`Clear ${selected.length} flag(s) as fine?`, `${formatNumber(selected.length)}টি ফ্ল্যাগ ঠিক আছে বলে ছাড়বেন?`)}</span>
              <button type="button" className="btn btn-primary admin-btn-sm" disabled={clearing} onClick={() => void clearSelected()}>
                {t('Yes, clear them', 'হ্যাঁ, ছাড়ুন')}
              </button>
              <button type="button" className="btn btn-ghost admin-btn-sm" onClick={() => setConfirming(false)}>
                {t('Cancel', 'বাতিল')}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost admin-btn-sm" onClick={() => setConfirming(true)}>
              <FaCheck aria-hidden="true" />
              {t('Clear selected', 'বাছাই করাগুলো ছাড়ুন')}
            </button>
          )}
        </div>
      )}

      {query.isPending ? (
        <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>
      ) : query.error ? (
        <div className="admin-alert">{t('Error:', 'ত্রুটি:')} {query.error.message}</div>
      ) : items.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">✨</span>
          <p>
            {filtered
              ? t('No flag matches.', 'মেলে এমন কোনো ফ্ল্যাগ নেই।')
              : t('Nothing is waiting for a look.', 'দেখার মতো কিছু অপেক্ষায় নেই।')}
          </p>
        </div>
      ) : (
        <ul className="sf-list">
          {items.map((flag) => {
            const name = flag.label || TYPE_NAME(flag.targetType);
            return (
              <li key={flag._id} className={`admin-card sf-row${flag.exists ? '' : ' is-gone'}`}>
                <input
                  type="checkbox"
                  className="sf-check"
                  checked={selected.includes(flag._id)}
                  onChange={() => toggle(flag._id)}
                  disabled={flag.status !== 'open'}
                  aria-label={t(`Select flag: ${name}`, `বাছাই করুন: ${name}`)}
                />
                <div className="sf-main">
                  <div className="sf-top">
                    <span className="sf-chip is-type">{TYPE_NAME(flag.targetType)}</span>
                    <span className="sf-label">{flag.label}</span>
                    <span className={`sf-chip${flag.severity === 'high' ? ' sf-sev-high' : ''}`}>
                      {t('Severity', 'মাত্রা')}: {SEVERITY_NAME(flag.severity)}
                    </span>
                    {flag.shadow && <span className="sf-chip">{t('Trial', 'পরীক্ষামূলক')}</span>}
                    {flag.status !== 'open' && (
                      <span className="sf-chip">{STATUSES().find((s) => s.value === flag.status)?.label}</span>
                    )}
                  </div>
                  <div className="admin-cell-muted" style={{ overflowWrap: 'anywhere' }}>
                    {flag.authorEmail} · {timeAgo(flag.createdAt)}
                    {flag.targetType === 'chat' &&
                      ` · ${t(`${flag.messageCount} message(s)`, `${formatNumber(flag.messageCount)}টি বার্তা`)}`}
                  </div>
                  {flag.excerpt && <p className="sf-excerpt">{flag.excerpt}</p>}
                  <ul className="sf-chips" aria-label={t('Reasons', 'কারণ')}>
                    {flag.reasons.map((r) => (
                      <ReasonChip key={`${r.source}-${r.code}`} reason={r} />
                    ))}
                  </ul>
                  <div className="sf-actions">
                    <button type="button" className="btn btn-ghost admin-btn-sm" onClick={() => setOpenId(flag._id)}>
                      {t('Take a look', 'দেখুন')}
                      <span className="sf-sr"> {name}</span>
                    </button>
                    <ContentLink flag={flag} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="admin-pager">
        <Pager
          page={query.data?.page ?? page}
          pageCount={query.data?.pageCount ?? 1}
          pageSize={PAGE_SIZE}
          total={query.data?.total ?? 0}
          onPage={(p) => setParam('page', p > 1 ? String(p) : '')}
          noun={t('flags', 'ফ্ল্যাগ')}
        />
      </div>

      <RuleTable />
      <AssistantUsage />

      {openId && <FlagDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
