import { FaDesktop, FaMoon, FaSun } from 'react-icons/fa';

import { useTheme, type ThemeChoice } from '../utils/theme.js';

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
  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      style={withLabel ? undefined : { color: resolved === 'dark' ? 'var(--color-sun)' : 'var(--color-brand)' }}
    >
      {resolved === 'dark' ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
      {withLabel && (next === 'dark' ? 'Dark mode' : 'Light mode')}
    </button>
  );
}

const CHOICES: readonly { value: ThemeChoice; label: string; icon: typeof FaSun }[] = [
  { value: 'system', label: 'Same as device', icon: FaDesktop },
  { value: 'light', label: 'Light', icon: FaSun },
  { value: 'dark', label: 'Dark', icon: FaMoon },
];

/** The full choice, device setting included, for the profile page. */
export function ThemeSetting() {
  const { choice, setTheme } = useTheme();
  return (
    <section className="card mt-6 w-full p-5 text-left text-ink sm:p-6" aria-labelledby="theme-title">
      <h2 id="theme-title" className="mt-0 mb-1 text-lg">
        Appearance
      </h2>
      <p className="mb-4 text-sm text-ink-muted">Light or dark, or follow your device&rsquo;s setting.</p>
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
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default ThemeToggle;
