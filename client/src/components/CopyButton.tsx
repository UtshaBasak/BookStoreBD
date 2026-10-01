import { useState } from 'react';
import { FaCheck, FaRegCopy } from 'react-icons/fa';

import { copyText } from '../utils/copyText.js';
import './CopyButton.css';

/**
 * A small button that copies some text - an order number, which people are
 * asked for on the phone and in chat, and which nobody wants to retype.
 */
export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' is-copied' : ''}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void copy();
      }}
      aria-label={copied ? 'Copied' : `${label} ${text}`}
      title={copied ? 'Copied' : label}
    >
      {copied ? <FaCheck aria-hidden="true" /> : <FaRegCopy aria-hidden="true" />}
      <span className="copy-btn-text" aria-live="polite">
        {copied ? 'Copied' : label}
      </span>
    </button>
  );
}
