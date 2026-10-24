import { useEffect, useState } from 'react';
import { FaArrowUp } from 'react-icons/fa';

import { t } from '../utils/language.js';
import './BackToTop.css';

/**
 * A round button in the bottom right that scrolls back to the top, shown once
 * the page has been scrolled a screen or so down. Rendered by the app shell, so
 * it is on every page.
 */
export default function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      className={`back-to-top${shown ? ' is-shown' : ''}`}
      onClick={toTop}
      aria-label={t('Back to top', 'ওপরে ফিরুন')}
      title={t('Back to top', 'ওপরে ফিরুন')}
      // Out of the tab order while it is hidden, so focus cannot land on
      // something invisible.
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
    >
      <FaArrowUp aria-hidden="true" />
    </button>
  );
}
