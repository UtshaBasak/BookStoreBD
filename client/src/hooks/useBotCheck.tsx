import { useCallback, useRef, useState, type ReactNode } from 'react';

import BotCheck, { type BotCheckHandle } from '../components/BotCheck.js';
import { useAuthConfig } from './queries.js';

/**
 * The bot check for a form, when the site has one: the element to place, the
 * token to send, whether the form may be sent yet, and a reset for after.
 * With no check configured, the form is always ready and sends no token. If
 * the check cannot load - an ad blocker, say - the form says so rather than
 * waiting silently.
 */
export const useBotCheck = (): { element: ReactNode; token: string | undefined; ready: boolean; reset: () => void } => {
  const { data: config, isPending } = useAuthConfig();
  const [token, setToken] = useState('');
  const [failed, setFailed] = useState(false);
  const handle = useRef<BotCheckHandle>(null);
  const siteKey = config?.captchaSiteKey ?? null;
  const fail = useCallback(() => setFailed(true), []);

  return {
    element: siteKey ? (
      <>
        <BotCheck ref={handle} siteKey={siteKey} onToken={setToken} onFail={fail} />
        {failed && (
          <p className="auth-message auth-message-error" role="alert">
            The security check could not load. Allow challenges.cloudflare.com in your browser or ad blocker, then
            reload the page.
          </p>
        )}
      </>
    ) : null,
    token: siteKey ? token || undefined : undefined,
    ready: !isPending && (!siteKey || Boolean(token) || failed),
    reset: () => handle.current?.reset(),
  };
};
