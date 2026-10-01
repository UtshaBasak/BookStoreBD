import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { NotificationItem } from '@shared/api.js';

import './Homepage.css';
import './NotificationsPage.css';
import Logo from '../components/Logo.js';
import Pager from '../components/Pager.js';
import { useMarkNotificationsRead, useNotifications } from '../hooks/queries.js';
import { useSeo } from '../hooks/useSeo.js';
import { NOTIFICATION_ICON, timeAgo } from '../utils/notificationLook.js';

const PAGE_SIZE = 20;

/** Everything the bell has told you, a page at a time. */
export default function NotificationsPage() {
  useSeo({ title: 'Notifications', noIndex: true });
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isPending } = useNotifications({ page, pageSize: PAGE_SIZE, unreadOnly });
  const { mutate: markRead, isPending: marking } = useMarkNotificationsRead();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const open = (item: NotificationItem) => {
    if (!item.read) markRead([item._id]);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="np-page">
      <header className="header">
        <Link to="/" className="logo-button" aria-label="BookStoreBD home">
          <Logo size={38} />
        </Link>
      </header>

      <main className="np-main">
        <div className="np-head">
          <div>
            <h1>Notifications</h1>
            <p>{unread ? `${unread} unread` : 'You are all caught up.'}</p>
          </div>
          <div className="np-tools">
            <button
              type="button"
              className={`chip${unreadOnly ? ' is-on' : ''}`}
              aria-pressed={unreadOnly}
              onClick={() => {
                setUnreadOnly((value) => !value);
                setPage(1);
              }}
            >
              Unread only
            </button>
            <Link to="/profile#notification-settings" className="btn btn-ghost">
              Settings
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => markRead()} disabled={!unread || marking}>
              Mark all read
            </button>
          </div>
        </div>

        {isPending ? (
          <div className="card np-empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="card np-empty">
            <span aria-hidden="true">🔔</span>
            <p>{unreadOnly ? 'No unread notifications.' : 'Nothing yet. Orders, returns, payouts and deals will show up here.'}</p>
          </div>
        ) : (
          <ul className="card np-list">
            {items.map((item) => (
              <li key={item._id}>
                <button type="button" className={`np-item${item.read ? '' : ' is-unread'}`} onClick={() => open(item)}>
                  <span className="np-icon" aria-hidden="true">
                    {NOTIFICATION_ICON[item.type] ?? '🔔'}
                  </span>
                  <span className="np-text">
                    <span className="np-title">{item.title}</span>
                    {item.body && <span className="np-body">{item.body}</span>}
                    <span className="np-time">{timeAgo(item.createdAt)}</span>
                  </span>
                  {!item.read && <span className="np-dot" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
        )}

        {data && data.pageCount > 1 && (
          <Pager page={data.page} pageCount={data.pageCount} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} noun="notifications" />
        )}
      </main>
    </div>
  );
}
