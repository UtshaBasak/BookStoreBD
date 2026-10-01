import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';

import { resolveTheme, readTheme } from '../utils/theme.js';

/** What the page can do with the check: start it again after a token is used. */
export interface BotCheckHandle {
  reset: () => void;
}

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

/** Cloudflare's script, fetched once and only on the pages that check. */
const loadTurnstile = (): Promise<TurnstileApi> => {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const ready = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('Turnstile did not load'));
    };
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile did not load'));
    };
    document.head.appendChild(script);
  });
  return loading;
};

/**
 * Cloudflare Turnstile, the bot check on sign-in and sign-up. Usually it
 * passes on its own and shows nothing; now and then it asks for one tick.
 * Each token works once, so the page resets the check after using it.
 * `onToken` should keep its identity (a state setter does), or the check is
 * drawn again on every render.
 */
export default function BotCheck({
  siteKey,
  onToken,
  onFail,
  ref,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  /** The check could not load at all - blocked, or offline. */
  onFail: () => void;
  ref?: Ref<BotCheckHandle>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const api = useRef<TurnstileApi | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onToken('');
      if (api.current && widget.current) api.current.reset(widget.current);
    },
  }));

  useEffect(() => {
    let gone = false;
    loadTurnstile()
      .then((turnstile) => {
        if (gone || !box.current) return;
        api.current = turnstile;
        widget.current = turnstile.render(box.current, {
          sitekey: siteKey,
          theme: resolveTheme(readTheme()),
          // Out of sight unless a person is needed.
          appearance: 'interaction-only',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => onFail());
    return () => {
      gone = true;
      if (api.current && widget.current) api.current.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, onToken, onFail]);

  return <div ref={box} className="auth-botcheck" />;
}
