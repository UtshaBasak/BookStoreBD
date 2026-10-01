import { FaCheckCircle, FaRegCircle } from 'react-icons/fa';

import { PASSWORD_RULES, passwordProblems } from '../utils/passwordPolicy.js';
import './PasswordChecklist.css';

/**
 * The password rules, ticked off as somebody types, under a strength bar.
 *
 * The rules are the server's (utils/passwordPolicy.ts mirrors them), so a
 * password this calls ready is one the server accepts - unless it turns up
 * in a known breach, which only the server checks and says so when it does.
 */
export default function PasswordChecklist({
  password,
  email,
  username,
  id,
}: {
  password: string;
  email?: string;
  username?: string;
  id?: string;
}) {
  const problems = new Set(passwordProblems(password, { email, username }));
  const met = PASSWORD_RULES.length - problems.size;
  const ready = password.length > 0 && problems.size === 0;
  const level = !password ? 0 : ready ? 4 : met >= PASSWORD_RULES.length - 2 ? 3 : met >= PASSWORD_RULES.length / 2 ? 2 : 1;
  const words = ['', 'Weak', 'Fair', 'Almost there', 'Strong'];

  return (
    <div className="pwc" id={id} aria-live="polite">
      <div className="pwc-bar" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={`pwc-seg${level >= step ? ` is-on is-${level}` : ''}`} />
        ))}
      </div>
      {password && <p className={`pwc-word is-${level}`}>{words[level]}</p>}
      <ul className="pwc-list">
        {PASSWORD_RULES.map((rule) => {
          const ok = password.length > 0 && !problems.has(rule.id);
          return (
            <li key={rule.id} className={ok ? 'is-ok' : ''}>
              {ok ? <FaCheckCircle aria-hidden="true" /> : <FaRegCircle aria-hidden="true" />}
              <span>
                {rule.label}
                <span className="sr-only">{ok ? ': done' : ': not yet'}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

