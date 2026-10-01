import { useEffect, useId, useRef, useState } from 'react';
import { FaEnvelope, FaFacebook, FaLink, FaShareNodes, FaTelegram, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';

import { useToast } from '../hooks/useToast.js';
import { copyText } from '../utils/copyText.js';
import './ShareBook.css';

/**
 * Share a book: to Facebook, WhatsApp, X, Telegram or e-mail, the phone's own
 * share sheet where there is one, or just copy the link.
 *
 * The link is the book's page, which previews as the book itself on those
 * sites - the server writes its title, price and cover into the page head.
 */
export default function ShareBook({ bookId, title, author }: { bookId: string; title: string; author?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const url = `${window.location.origin}/book/${bookId}`;
  const text = author ? `"${title}" by ${author} on BookStoreBD` : `"${title}" on BookStoreBD`;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    if (await copyText(url)) toast.success('Link copied.');
    else toast.error(`Could not copy it. The link is ${url}`);
    setOpen(false);
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // Cancelled: nothing to say.
    }
    setOpen(false);
  };

  const targets = [
    { label: 'Facebook', icon: FaFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, tone: '#1877f2' },
    { label: 'WhatsApp', icon: FaWhatsapp, href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, tone: '#25d366' },
    { label: 'X', icon: FaXTwitter, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`, tone: 'var(--color-ink)' },
    { label: 'Telegram', icon: FaTelegram, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, tone: '#229ed9' },
    { label: 'E-mail', icon: FaEnvelope, href: `mailto:?subject=${encodedText}&body=${encodeURIComponent(`${text}\n${url}`)}`, tone: 'var(--color-brand)' },
  ];

  return (
    <div className="share" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-ghost share-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <FaShareNodes aria-hidden="true" /> Share
      </button>
      {open && (
        <div id={panelId} className="share-panel" role="dialog" aria-label="Share this book">
          <ul>
            {targets.map(({ label, icon: Icon, href, tone }) => (
              <li key={label}>
                <a
                  href={href}
                  target={href.startsWith('mailto:') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <Icon aria-hidden="true" style={{ color: tone }} />
                  {label}
                </a>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => void copy()}>
                <FaLink aria-hidden="true" />
                Copy link
              </button>
            </li>
            {canNativeShare && (
              <li>
                <button type="button" onClick={() => void nativeShare()}>
                  <FaShareNodes aria-hidden="true" />
                  More options
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
