import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { FaBell } from 'react-icons/fa';

import type { NotificationItem } from '@shared/api.js';

import './NotificationBell.css';
import { useMarkNotificationsRead, useNotifications } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { NOTIFICATION_ICON, timeAgo } from '../utils/notificationLook.js';
import { subscribeToNotifications } from '../utils/socket.js';

/**
 * Arrivals already toasted. A page can draw more than one bell - the admin
 * panel has one in its top bar and one in its sidebar for phones - and each
 * hears the same event; one toast is enough.
 */
const toasted = new Set<string>();

/**
 * The bell in the header: how many notifications are unread, and the latest
 * of them in a panel.
 *
 * An order placed, a status changed, a return decided, a payout made or a deal
 * on a saved book lands here live, over the same connection the chat uses,
 * with a small toast when it arrives. Nothing is shown to a visitor who is not
 * signed in.
 */
export default function NotificationBell() {
  const signedIn = Boolean(getUserEmail());
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const navigate = useNavigate();
  const toast = useToast();
  const client = useQueryClient();

  const { data } = useNotifications({ pageSize: 8 }, { enabled: signedIn });
  const { mutate: markRead } = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  // Arrivals: refresh the lists, and say so briefly.
  useEffect(() => {
    if (!signedIn) return undefined;
    return subscribeToNotifications((item) => {
      if (toasted.has(item._id)) return;
      toasted.add(item._id);
      void client.invalidateQueries({ queryKey: ['notifications'] });
      toast.info(item.title);
    });
  }, [signedIn, client, toast]);

  // Closed by a click anywhere else, or by Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!signedIn) return null;

  const openItem = (item: NotificationItem) => {
    if (!item.read) markRead([item._id]);
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="nb" ref={wrapRef}>
      <button
        type="button"
        className="icon-button nb-button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
      >
        <FaBell aria-hidden="true" />
        {unread > 0 && (
          <span className="nb-badge" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="nb-panel" id={panelId} role="region" aria-label="Notifications">
          <div className="nb-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="nb-link-button" onClick={() => markRead()}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="nb-empty">Nothing yet. Orders, returns and deals will show up here.</p>
          ) : (
            <ul className="nb-list">
              {items.map((item) => (
                <li key={item._id}>
                  <button type="button" className={`nb-item${item.read ? '' : ' is-unread'}`} onClick={() => openItem(item)}>
                    <span className="nb-icon" aria-hidden="true">
                      {NOTIFICATION_ICON[item.type] ?? '🔔'}
                    </span>
                    <span className="nb-text">
                      <span className="nb-title">{item.title}</span>
                      {item.body && <span className="nb-body">{item.body}</span>}
                      <span className="nb-time">{timeAgo(item.createdAt)}</span>
                    </span>
                    {!item.read && <span className="nb-dot" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" className="nb-all" onClick={() => setOpen(false)}>
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
