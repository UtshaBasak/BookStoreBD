import { FaDesktop, FaMoon, FaSun } from 'react-icons/fa';

import { useTheme, type ThemeChoice } from '../utils/theme.js';
import { t } from '../utils/language.js';

/** One tap between light and dark, for a header or footer. */
export function ThemeToggle({
  className = 'icon-button theme-toggle',
  withLabel = false,
}: {
  className?: string;
  /** "Dark mode" beside the icon, where there is room for it. */
  withLabel?: boolean;
}) {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const switchLabel = t(`Switch to ${next} mode`, next === 'dark' ? 'গাঢ় মোডে যান' : 'হালকা মোডে যান');
  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={switchLabel}
      title={switchLabel}
      style={withLabel ? undefined : { color: resolved === 'dark' ? 'var(--color-sun)' : 'var(--color-brand)' }}
    >
      {resolved === 'dark' ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
      {withLabel && (next === 'dark' ? t('Dark mode', 'গাঢ় মোড') : t('Light mode', 'হালকা মোড'))}
    </button>
  );
}

const CHOICES: readonly { value: ThemeChoice; label: () => string; icon: typeof FaSun }[] = [
  { value: 'system', label: () => t('Same as device', 'ডিভাইসের মতো'), icon: FaDesktop },
  { value: 'light', label: () => t('Light', 'হালকা'), icon: FaSun },
  { value: 'dark', label: () => t('Dark', 'গাঢ়'), icon: FaMoon },
];

/** The full choice, device setting included, for the profile page. */
export function ThemeSetting() {
  const { choice, setTheme } = useTheme();
  return (
    <section className="card mt-6 w-full p-5 text-left text-ink sm:p-6" aria-labelledby="theme-title">
      <h2 id="theme-title" className="mt-0 mb-1 text-lg">
        {t('Appearance', 'চেহারা')}
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        {t('Light or dark, or follow your device’s setting.', 'হালকা বা গাঢ়, অথবা আপনার ডিভাইসের সেটিং অনুযায়ী।')}
      </p>
      <div role="radiogroup" aria-labelledby="theme-title" className="flex flex-wrap gap-2">
        {CHOICES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={choice === value}
            onClick={() => setTheme(value)}
            className={`btn ${choice === value ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Icon aria-hidden="true" /> {label()}
          </button>
        ))}
      </div>
    </section>
  );
}

export default ThemeToggle;
