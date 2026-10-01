import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FaBell } from 'react-icons/fa';

import type { NotificationCategory } from '@shared/api.js';

import { useNotificationSettings, useSaveNotificationSettings } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import './NotificationSettings.css';

/** A switch that reads as one to a screen reader. */
function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`ns-switch${on ? ' is-on' : ''}`}
    >
      <span className="ns-knob" aria-hidden="true" />
    </button>
  );
}

/**
 * What a person wants to hear about, in the app and by e-mail, on their
 * profile page. Each switch saves as it is flipped.
 */
export default function NotificationSettings() {
  const toast = useToast();
  const { hash } = useLocation();
  const { data } = useNotificationSettings();
  const { mutate: save, isPending } = useSaveNotificationSettings();

  // Arriving from the notifications page's "Settings" link.
  useEffect(() => {
    if (data && hash === '#notification-settings') document.getElementById('notification-settings')?.scrollIntoView();
  }, [data, hash]);

  if (!data) return null;

  const change = (id: NotificationCategory, channel: 'inApp' | 'email', on: boolean) => {
    const current = data.categories.find((category) => category.id === id);
    if (!current) return;
    save(
      { [id]: { inApp: current.inApp, email: current.email, [channel]: on } },
      { onError: (error) => toast.error(messageOf(error) || 'Could not save that choice.') }
    );
  };

  return (
    <section id="notification-settings" className="card mt-6 w-full scroll-mt-24 p-5 text-left text-ink sm:p-6" aria-labelledby="ns-title">
      <h2 id="ns-title" className="mt-0 mb-1 flex items-center gap-2 text-lg">
        <FaBell aria-hidden="true" className="text-brand" /> Notifications
      </h2>
      <p className="mb-4 text-sm text-ink-muted">
        Choose what you hear about, in the app and by e-mail. Sign-in codes, security alerts and changes to your
        account are always sent.
      </p>

      <div className="ns-table" role="table" aria-label="Notification choices">
        <div className="ns-row ns-head" role="row">
          <span role="columnheader">Topic</span>
          <span role="columnheader">In the app</span>
          <span role="columnheader">By e-mail</span>
        </div>
        {data.categories.map((category) => (
          <div key={category.id} className="ns-row" role="row">
            <span role="cell" className="ns-topic">
              <strong>{category.label}</strong>
              <small>{category.description}</small>
            </span>
            <span role="cell">
              <Switch
                on={category.inApp}
                disabled={isPending}
                label={`${category.label} in the app`}
                onChange={(on) => change(category.id, 'inApp', on)}
              />
            </span>
            <span role="cell">
              {category.emailAvailable ? (
                <Switch
                  on={category.email}
                  disabled={isPending}
                  label={`${category.label} by e-mail`}
                  onChange={(on) => change(category.id, 'email', on)}
                />
              ) : (
                <span className="ns-none" title="Nothing in this topic is e-mailed">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
