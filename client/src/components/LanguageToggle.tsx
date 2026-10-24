import { FaDesktop } from 'react-icons/fa';

import { t, type LanguageChoice } from '../utils/language.js';
import { useLanguage } from '../utils/useLanguage.js';

/**
 * One tap between English and Bangla, for a header. It names the language it
 * switches to, in that language, so someone who reads only one of them can
 * still find it.
 */
export function LanguageToggle({
  className = 'icon-button language-toggle',
  withLabel = false,
}: {
  className?: string;
  /** The whole name rather than the short one, where there is room. */
  withLabel?: boolean;
}) {
  const { language, setLanguage } = useLanguage();
  const next = language === 'bn' ? 'en' : 'bn';
  const label = next === 'bn' ? 'বাংলায় দেখুন' : 'View in English';
  return (
    <button
      type="button"
      className={className}
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
      lang={next}
    >
      <span aria-hidden="true" className="language-toggle-text">
        {withLabel ? (next === 'bn' ? 'বাংলা' : 'English') : next === 'bn' ? 'বাং' : 'EN'}
      </span>
    </button>
  );
}

const CHOICES: readonly { value: LanguageChoice; label: () => string; lang?: string }[] = [
  { value: 'system', label: () => t('Same as browser', 'ব্রাউজারের মতো') },
  { value: 'en', label: () => 'English', lang: 'en' },
  { value: 'bn', label: () => 'বাংলা', lang: 'bn' },
];

/** The full choice, the browser's own language included, for the profile page. */
export function LanguageSetting() {
  const { choice, setLanguage } = useLanguage();
  return (
    <section className="card mt-6 w-full p-5 text-left text-ink sm:p-6" aria-labelledby="language-title">
      <h2 id="language-title" className="mt-0 mb-1 text-lg">
        {t('Language', 'ভাষা')}
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        {t(
          'The site, and the e-mails and notifications we send you, in English or Bangla.',
          'সাইট এবং আমাদের পাঠানো ই-মেইল ও নোটিফিকেশন ইংরেজিতে বা বাংলায়।'
        )}
      </p>
      <div role="radiogroup" aria-labelledby="language-title" className="flex flex-wrap gap-2">
        {CHOICES.map(({ value, label, lang }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => setLanguage(value)}
            className={`btn ${choice === value ? 'btn-primary' : 'btn-ghost'}`}
            lang={lang}
          >
            {value === 'system' && <FaDesktop aria-hidden="true" />} {label()}
          </button>
        ))}
      </div>
    </section>
  );
}

export default LanguageToggle;
