import { Suspense, lazy, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { FaMicrophone, FaPaperPlane, FaPlus, FaThumbsDown, FaThumbsUp, FaTimes } from 'react-icons/fa';

import type { AssistantHandover, AssistantOrder, AssistantReply, AssistantTurn } from '@shared/api.js';

import BookCard from '../BookCard.js';
import { useAskAssistant, useAssistantFeedback, useCreateWanted } from '../../hooks/queries.js';
import { ApiRequestError, messageOf } from '../../utils/apiError.js';
import { getUserEmail } from '../../utils/auth.js';
import { allowed } from '../../utils/consent.js';
import { formatDate, formatNumber, t } from '../../utils/language.js';
import { useLanguage } from '../../utils/useLanguage.js';
import { getRecentlyViewed } from '../../utils/recentlyViewed.js';
import { listen, readVoiceLanguage, voiceSearchSupported, type Listening } from '../../utils/voiceSearch.js';
import './Assistant.css';

// The chat window is only needed when someone chooses to talk to a person.
const ChatWindow = lazy(() => import('../ChatWindow.js'));

const MAX_LENGTH = 500;
const STORE_KEY = 'assistantChat';
const KEEP = 20;
const STAGES = ['Order Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'] as const;
const STAGES_BN = ['অর্ডার নিশ্চিত', 'প্রস্তুত হচ্ছে', 'পাঠানো হয়েছে', 'ডেলিভারির পথে', 'ডেলিভারি সম্পন্ন'] as const;
const REASONS = ['wrong', 'unhelpful', 'off-topic', 'slow', 'other'] as const;
type Reason = (typeof REASONS)[number];

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  reply?: AssistantReply;
}

type Failure =
  | { kind: 'offline'; question: string }
  | { kind: 'limit'; question: string; message: string }
  | { kind: 'other'; question: string; message: string };

/** A link is shown only if it stays on this site: a path, never `//host` or a scheme. */
const isLocalHref = (href: unknown): href is string =>
  typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') && !href.includes('\\');

const restore = (): Message[] => {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(stored) ? (stored as Message[]).slice(-KEEP) : [];
  } catch {
    return [];
  }
};
const remember = (messages: Message[]): void => {
  try {
    if (messages.length) sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-KEEP)));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* kept for this page only */
  }
};

const suggestions = (): string[] => [
  t('What are the delivery charges?', 'ডেলিভারি চার্জ কত?'),
  t('How do returns work?', 'রিটার্ন কীভাবে কাজ করে?'),
  t('Track my order', 'আমার অর্ডার ট্র্যাক করুন'),
  t('Find a book under ৳300', '৩০০ টাকার নিচে একটি বই খুঁজে দিন'),
];

const reasonLabel = (reason: Reason): string =>
  ({
    wrong: t('Wrong answer', 'ভুল উত্তর'),
    unhelpful: t('Not helpful', 'কাজে লাগেনি'),
    'off-topic': t('Off topic', 'বিষয়ের বাইরে'),
    slow: t('Too slow', 'খুব ধীর'),
    other: t('Other', 'অন্য কিছু'),
  })[reason];

/** Plain text, one paragraph per line. Never HTML. */
function PlainText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <p key={index} className="as-line">
          {line}
        </p>
      ))}
    </>
  );
}

function OrderCard({ order }: { order: AssistantOrder }) {
  const cancelled = order.stage < 0;
  return (
    <div className="as-order">
      <div className="as-order-head">
        <strong>
          {t('Order', 'অর্ডার')} #{order.orderNumber}
        </strong>
        <span className={`as-badge${cancelled ? ' is-cancelled' : ''}`}>{order.statusLabel}</span>
      </div>
      {cancelled ? (
        <p className="as-order-cancelled">{t('This order was cancelled.', 'এই অর্ডারটি বাতিল করা হয়েছে।')}</p>
      ) : (
        <ol className="as-stages" aria-label={t('Order progress', 'অর্ডারের অগ্রগতি')}>
          {STAGES.map((name, index) => (
            <li key={name} className={index <= order.stage ? 'is-done' : ''} aria-current={index === order.stage ? 'step' : undefined}>
              <span className="as-dot" aria-hidden="true" />
              <span className="as-stage-name">{t(name, STAGES_BN[index])}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="as-order-text">{order.explanation}</p>
      <p className="as-meta">
        {order.books.map((book) => `${book.title} × ${formatNumber(book.quantity)}`).join(', ')} · ৳{formatNumber(order.total)}
      </p>
      {order.returnableUntil && (
        <p className="as-meta">
          {t('Returnable until', 'ফেরত দেওয়া যাবে')} {formatDate(order.returnableUntil)}
        </p>
      )}
      {isLocalHref(order.link) && (
        <Link className="as-link" to={order.link}>
          {t('View this order', 'অর্ডারটি দেখুন')}
        </Link>
      )}
    </div>
  );
}

function Handover({
  handover,
  questions,
  onChat,
}: {
  handover: AssistantHandover;
  questions: string[];
  onChat: (receiver: string, name: string, draft: string) => void;
}) {
  const [summary, setSummary] = useState(false);
  const box = useId();
  const signedIn = Boolean(getUserEmail());
  // Only a draft: the person reads it and presses Send themselves.
  const draft = summary
    ? [
        handover.bookTitle
          ? t(`About "${handover.bookTitle}". My questions so far:`, `"${handover.bookTitle}" সম্পর্কে। এ পর্যন্ত আমার প্রশ্ন:`)
          : t('My questions so far:', 'এ পর্যন্ত আমার প্রশ্ন:'),
        ...questions.slice(-3).map((question) => `- ${question}`),
      ].join('\n')
    : '';

  return (
    <div className="as-handover">
      <p className="as-order-text">
        {handover.kind === 'seller'
          ? t(`Want to ask ${handover.name}, the seller?`, `বিক্রেতা ${handover.name}-কে জিজ্ঞেস করতে চান?`)
          : t('Want to talk to the shop?', 'দোকানের সাথে কথা বলতে চান?')}
      </p>
      {handover.chatWith &&
        (signedIn ? (
          <>
            <label className="as-check" htmlFor={box}>
              <input id={box} type="checkbox" checked={summary} onChange={(event) => setSummary(event.target.checked)} />
              {t('Include a summary of this conversation', 'এই কথোপকথনের সারসংক্ষেপ যুক্ত করুন')}
            </label>
            <button type="button" className="as-action" onClick={() => onChat(handover.chatWith as string, handover.name, draft)}>
              {t(`Chat with ${handover.name}`, `${handover.name}-এর সাথে চ্যাট করুন`)}
            </button>
          </>
        ) : (
          <Link className="as-link" to="/sign-in">
            {t('Sign in to chat', 'চ্যাট করতে সাইন ইন করুন')}
          </Link>
        ))}
      {handover.kind === 'shop' && handover.email && (
        <a className="as-link" href={`mailto:${handover.email}`}>
          {t('E-mail the shop', 'দোকানকে ই-মেইল করুন')}
        </a>
      )}
    </div>
  );
}

function WantedOffer({ offer }: { offer: { title: string; author: string } }) {
  const create = useCreateWanted();
  const [result, setResult] = useState('');
  if (!getUserEmail())
    return (
      <div className="as-handover">
        <Link className="as-link" to="/sign-in">
          {t('Sign in to ask for this book on the Wanted board', 'চাওয়া বইয়ের তালিকায় অনুরোধ করতে সাইন ইন করুন')}
        </Link>
      </div>
    );
  return (
    <div className="as-handover">
      {result ? (
        <p className="as-order-text" role="status">
          {result}
        </p>
      ) : (
        // Nothing is posted until this is pressed.
        <button
          type="button"
          className="as-action"
          disabled={create.isPending}
          onClick={() =>
            create.mutate(
              { title: offer.title, author: offer.author || undefined },
              { onSuccess: (done) => setResult(done.message), onError: (error) => setResult(messageOf(error)) }
            )
          }
        >
          {t(`Ask for "${offer.title}" on the Wanted board`, `চাওয়া বইয়ের তালিকায় "${offer.title}" চান`)}
        </button>
      )}
    </div>
  );
}

function Feedback({ requestId }: { requestId: string }) {
  const send = useAssistantFeedback();
  const [state, setState] = useState<'idle' | 'reasons' | 'done'>('idle');
  if (!requestId) return null;
  const submit = (helpful: boolean, reason?: Reason) => {
    send.mutate({ requestId, helpful, reason });
    setState('done');
  };
  if (state === 'done')
    return (
      <p className="as-meta" role="status">
        {t('Thanks for the feedback.', 'মতামতের জন্য ধন্যবাদ।')}
      </p>
    );
  return (
    <div className="as-feedback">
      <span className="as-meta">{t('Was this helpful?', 'এটি কি কাজে লেগেছে?')}</span>
      <button type="button" className="as-icon" aria-label={t('Helpful', 'কাজে লেগেছে')} onClick={() => submit(true)}>
        <FaThumbsUp aria-hidden="true" />
      </button>
      <button
        type="button"
        className="as-icon"
        aria-label={t('Not helpful', 'কাজে লাগেনি')}
        aria-expanded={state === 'reasons'}
        onClick={() => setState('reasons')}
      >
        <FaThumbsDown aria-hidden="true" />
      </button>
      {state === 'reasons' && (
        <div className="as-reasons" role="group" aria-label={t('What went wrong?', 'কী সমস্যা হয়েছে?')}>
          {REASONS.map((reason) => (
            <button key={reason} type="button" className="as-chip" onClick={() => submit(false, reason)}>
              {reasonLabel(reason)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chips({ onPick, disabled }: { onPick: (text: string) => void; disabled: boolean }) {
  return (
    <div className="as-chips">
      {suggestions().map((text) => (
        <button key={text} type="button" className="as-chip" disabled={disabled} onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export interface AssistantPanelProps {
  onClose: () => void;
}

export default function AssistantPanel({ onClose }: AssistantPanelProps) {
  // Read so the panel draws again in a new language.
  useLanguage();
  const [messages, setMessages] = useState<Message[]>(restore);
  const [input, setInput] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [chat, setChat] = useState<{ receiver: string; name: string; draft: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const ask = useAskAssistant();
  const field = useRef<HTMLTextAreaElement | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const session = useRef<Listening | null>(null);
  const nextId = useRef(messages.reduce((top, message) => Math.max(top, message.id), 0) + 1);
  const titleId = useId();
  const canSpeak = voiceSearchSupported();
  const busy = ask.isPending;

  useEffect(() => {
    field.current?.focus();
    return () => session.current?.stop();
  }, []);

  useEffect(() => {
    remember(messages);
    // jsdom has no scrollIntoView.
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy, failure]);

  const last = messages[messages.length - 1];
  const showChips =
    (messages.length === 0 && !busy) || (failure !== null && failure.kind !== 'limit') || Boolean(!busy && last?.reply?.fallback);

  const send = (raw: string) => {
    const question = raw.trim().slice(0, MAX_LENGTH);
    if (!question || busy) return;
    setFailure(null);
    setVoiceError('');
    const history: AssistantTurn[] = messages.slice(-6).map(({ role, text }) => ({ role, text: text.slice(0, 1500) }));
    setMessages((all) => [...all, { id: nextId.current++, role: 'user', text: question }]);
    setInput('');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setFailure({ kind: 'offline', question });
      return;
    }
    const seen = allowed('personalisation') ? getRecentlyViewed().slice(0, 20) : [];
    ask.mutate(
      { message: question, history, ...(seen.length ? { seen } : {}) },
      {
        onSuccess: (reply) => setMessages((all) => [...all, { id: nextId.current++, role: 'assistant', text: reply.reply, reply }]),
        onError: (error) => {
          const code = error instanceof ApiRequestError ? (error.body as { code?: string } | undefined)?.code : undefined;
          setFailure({ kind: code === 'assistant-daily-limit' ? 'limit' : 'other', question, message: messageOf(error) });
        },
      }
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(input);
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send(input);
    }
  };

  const newChat = () => {
    session.current?.stop();
    setMessages([]);
    setFailure(null);
    setVoiceError('');
    setChat(null);
    remember([]);
    field.current?.focus();
  };

  const toggleVoice = () => {
    if (listening) {
      session.current?.stop();
      return;
    }
    setVoiceError('');
    const started = listen(
      readVoiceLanguage(),
      (words) => setInput(words.slice(0, MAX_LENGTH)),
      (message) => setVoiceError(message),
      () => {
        session.current = null;
        setListening(false);
      }
    );
    if (started) {
      session.current = started;
      setListening(true);
    }
  };

  const questions = messages.filter((message) => message.role === 'user').map((message) => message.text);

  return (
    <section
      className="as-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="as-head">
        <div className="as-head-text">
          <h2 id={titleId} className="as-title">
            {t('BookStoreBD assistant', 'BookStoreBD সহকারী')}
          </h2>
          <p className="as-note">
            {t('AI assistant – may make mistakes.', 'এআই সহকারী – ভুল হতে পারে।')}{' '}
            <Link to="/privacy#assistant" onClick={onClose}>
              {t('What is shared', 'কী শেয়ার হয়')}
            </Link>
          </p>
        </div>
        <button type="button" className="as-head-btn" onClick={newChat} aria-label={t('New chat', 'নতুন চ্যাট')} title={t('New chat', 'নতুন চ্যাট')}>
          <FaPlus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="as-head-btn"
          onClick={onClose}
          aria-label={t('Close assistant', 'সহকারী বন্ধ করুন')}
          title={t('Close', 'বন্ধ করুন')}
        >
          <FaTimes aria-hidden="true" />
        </button>
      </header>

      <div className="as-log" role="log" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && (
          <p className="as-welcome">
            {t(
              'Hi! Ask me about books, delivery, returns or your orders, in English or Bangla.',
              'হ্যালো! বই, ডেলিভারি, রিটার্ন বা আপনার অর্ডার নিয়ে ইংরেজি বা বাংলায় জিজ্ঞেস করুন।'
            )}
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`as-msg as-${message.role}`}>
            <div className="as-bubble">
              <PlainText text={message.text} />
            </div>
            {message.reply && (
              <div className="as-extras">
                {message.reply.fallback && (
                  <p className="as-meta">
                    {t('The assistant is busy right now, so this is a basic answer.', 'সহকারী এখন ব্যস্ত, তাই এটি একটি সাধারণ উত্তর।')}
                  </p>
                )}
                {message.reply.books.length > 0 && (
                  <div className="as-books">
                    {message.reply.books.map((book) => (
                      <div key={book._id} className="as-book">
                        <BookCard book={book} />
                      </div>
                    ))}
                  </div>
                )}
                {message.reply.orders.map((order) => (
                  <OrderCard key={order.orderNumber} order={order} />
                ))}
                {message.reply.links.some((link) => isLocalHref(link.href)) && (
                  <ul className="as-links">
                    {message.reply.links
                      .filter((link) => isLocalHref(link.href))
                      .map((link) => (
                        <li key={link.href}>
                          <Link className="as-link" to={link.href}>
                            {link.label}
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
                {message.reply.handover && (
                  <Handover handover={message.reply.handover} questions={questions} onChat={(receiver, name, draft) => setChat({ receiver, name, draft })} />
                )}
                {message.reply.wanted && <WantedOffer offer={message.reply.wanted} />}
                <Feedback requestId={message.reply.requestId} />
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="as-msg as-assistant" role="status">
            <div className="as-bubble as-typing" aria-label={t('The assistant is typing', 'সহকারী লিখছে')}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {failure && (
          <div className="as-error" role="alert">
            {failure.kind === 'offline' && (
              <p>{t('You are offline. Check your connection and try again.', 'আপনি অফলাইনে আছেন। সংযোগ দেখে আবার চেষ্টা করুন।')}</p>
            )}
            {failure.kind === 'limit' && (
              <>
                <p>{failure.message}</p>
                <Link className="as-link" to={`/filter?search=${encodeURIComponent(failure.question)}`}>
                  {t('Search the shop for this', 'দোকানে এটি খুঁজুন')}
                </Link>
                <Link className="as-link" to="/how-it-works">
                  {t('How BookStoreBD works', 'BookStoreBD কীভাবে কাজ করে')}
                </Link>
              </>
            )}
            {failure.kind === 'other' && (
              <>
                <p>{failure.message || t('Something went wrong.', 'কিছু একটা সমস্যা হয়েছে।')}</p>
                <button type="button" className="as-action" onClick={() => send(failure.question)}>
                  {t('Try again', 'আবার চেষ্টা করুন')}
                </button>
              </>
            )}
          </div>
        )}

        {showChips && <Chips onPick={send} disabled={busy} />}
        <div ref={end} />
      </div>

      {voiceError && (
        <p className="as-voice-error" role="status">
          {voiceError}
        </p>
      )}
      <form className="as-form" onSubmit={submit}>
        <textarea
          ref={field}
          className="as-input"
          rows={1}
          maxLength={MAX_LENGTH}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKey}
          placeholder={t('Ask a question…', 'প্রশ্ন লিখুন…')}
          aria-label={t('Your question', 'আপনার প্রশ্ন')}
        />
        {canSpeak && (
          <button
            type="button"
            className={`as-icon as-mic${listening ? ' is-on' : ''}`}
            onClick={toggleVoice}
            aria-pressed={listening}
            aria-label={listening ? t('Stop listening', 'শোনা বন্ধ করুন') : t('Ask by voice', 'কণ্ঠে জিজ্ঞেস করুন')}
          >
            <FaMicrophone aria-hidden="true" />
          </button>
        )}
        <button type="submit" className="as-send" disabled={busy || !input.trim()} aria-label={t('Send', 'পাঠান')}>
          <FaPaperPlane aria-hidden="true" />
        </button>
      </form>

      {chat && (
        <Suspense fallback={null}>
          <ChatWindow receiver={chat.receiver} receiverName={chat.name} initialDraft={chat.draft || undefined} onClose={() => setChat(null)} />
        </Suspense>
      )}
    </section>
  );
}
