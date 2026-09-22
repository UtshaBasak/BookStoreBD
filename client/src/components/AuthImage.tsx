import { useEffect, useState, type CSSProperties } from 'react';

import { apiFetch } from '../config/api.js';
import { reportError } from '../utils/report.js';

interface AuthImageProps {
  /** A path on this API, e.g. `/api/chat/messages/:id/image`. */
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * An image from an endpoint that requires the session.
 *
 * A chat attachment is private to the two people in the thread, so the
 * endpoint checks who is asking - and an `<img src>` cannot carry an
 * Authorization header. It is fetched with the session instead and handed to
 * the tag as a blob.
 *
 * The blob's type is checked before it is used: a blob URL loads in this
 * origin, and a `text/html` one in an `<img>` is harmless but in a tab is not,
 * so the habit is worth keeping consistent.
 */
export default function AuthImage({ src, alt, className, style }: AuthImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    const load = async () => {
      try {
        const response = await apiFetch(src);
        if (!response.ok) throw new Error(`Image request failed with ${String(response.status)}`);

        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('That attachment is not an image');

        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch (error) {
        reportError('Could not load a chat attachment:', error);
        if (!cancelled) setFailed(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      // Released on unmount, or the tab keeps every picture ever scrolled past.
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (failed) {
    return (
      <span className={className} style={{ ...style, fontSize: 13, opacity: 0.7 }}>
        Attachment unavailable
      </span>
    );
  }

  if (!objectUrl) {
    // A box the right shape, so the thread does not jump when it arrives.
    return (
      <span
        className={className}
        style={{ ...style, display: 'block', minHeight: 60, opacity: 0.4 }}
        aria-label={`${alt} (loading)`}
      />
    );
  }

  return <img src={objectUrl} alt={alt} className={className} style={style} />;
}
