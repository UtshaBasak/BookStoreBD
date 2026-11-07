import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaCommentDots } from 'react-icons/fa';

import { useAssistantConfig } from '../../hooks/queries.js';
import { t } from '../../utils/language.js';
import './AssistantLauncher.css';

// The panel is its own chunk: nobody downloads it until they ask for it.
const AssistantPanel = lazy(() => import('./AssistantPanel.js'));

const OPEN_KEY = 'assistantOpen';

const readOpen = (): boolean => {
  try {
    return sessionStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
};
const writeOpen = (open: boolean): void => {
  try {
    sessionStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    /* remembered for this page only */
  }
};

/** Runs `work` when the browser is idle, or after about two seconds where it has no idle callback. */
const whenIdle = (work: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(work, { timeout: 2000 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(work, 2000);
  return () => window.clearTimeout(id);
};

/**
 * The round button that opens the shopping assistant. It asks the server
 * whether there is an assistant only once the page is idle, so it never
 * competes with what the visitor came to see, and draws nothing when there is
 * none. Everything else lives in the lazily loaded panel.
 */
export default function AssistantLauncher() {
  const { pathname } = useLocation();
  const [idle, setIdle] = useState(false);
  const [open, setOpen] = useState(readOpen);
  const button = useRef<HTMLButtonElement | null>(null);
  const { data } = useAssistantConfig(idle);

  useEffect(() => whenIdle(() => setIdle(true)), []);

  const hidden = pathname.startsWith('/admin') || pathname === '/chat' || pathname.startsWith('/chat/');
  if (!data?.enabled || hidden) return null;

  const change = (next: boolean) => {
    setOpen(next);
    writeOpen(next);
  };

  return (
    <>
      {!open && (
        <button
          ref={button}
          type="button"
          className="assistant-launcher"
          aria-label={t('Ask the BookStoreBD assistant', 'BookStoreBD সহকারীকে জিজ্ঞেস করুন')}
          title={t('Ask the BookStoreBD assistant', 'BookStoreBD সহকারীকে জিজ্ঞেস করুন')}
          onClick={() => change(true)}
        >
          <FaCommentDots aria-hidden="true" />
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <AssistantPanel
            onClose={() => {
              change(false);
              // The launcher comes back on the next render; focus follows it.
              requestAnimationFrame(() => button.current?.focus());
            }}
          />
        </Suspense>
      )}
    </>
  );
}
