/**
 * The chat page: opening a conversation clears its unread badge, older
 * messages load with the session (a plain fetch was refused), and deleting a
 * conversation says it is only from the caller's side.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';

import ChatPage from './ChatPage.js';
import { setSession } from '../utils/auth.js';

vi.mock('../utils/socket.js', () => ({
  subscribeToMessages: () => () => undefined,
  subscribeToNotifications: () => () => undefined,
  default: () => () => undefined,
}));

const ME = 'alice@test.com';
const THEM = 'bob@test.com';

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const message = (n: number) => ({ _id: `m${n}`, sender: THEM, receiver: ME, message: `Message ${n}`, timestamp: new Date(2026, 0, 1, 0, n).toISOString() });

const stub = () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) => {
    const url = String(input);
    if (url.includes('/chat/history/')) return json([{ email: THEM, username: 'bob', lastMessage: 'Message 20', lastMessageTime: new Date().toISOString(), unreadCount: 2 }]);
    if (url.includes('/chat/messages') && url.includes('page=1')) return json({ messages: Array.from({ length: 20 }, (_, n) => message(n + 1)), page: 1, limit: 20 });
    if (url.includes('/chat/messages')) return json({ messages: [message(0)], page: 2, limit: 20 });
    return json({ success: true, count: 0 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter>
          <ChatPage />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: ME, role: 'user' } });
  // jsdom lays nothing out, so it has no scrolling to do.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the chat page', () => {
  it('clears the unread badge when a conversation is opened', async () => {
    stub();
    show();

    expect(await screen.findByLabelText('2 unread')).toBeInTheDocument();
    await userEvent.click(screen.getByText('bob'));

    await waitFor(() => expect(screen.queryByLabelText('2 unread')).not.toBeInTheDocument());
  });

  it('loads older messages with the session', async () => {
    const fetchMock = stub();
    const { container } = show();
    await userEvent.click(await screen.findByText('bob'));
    await screen.findByText('Message 1');

    const thread = container.querySelector('.chat-messages') as HTMLDivElement;
    thread.scrollTop = 0;
    fireEvent.scroll(thread);

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true));
    const older = fetchMock.mock.calls.find(([url]) => String(url).includes('page=2'));
    expect(new Headers(older?.[1]?.headers).get('Authorization')).toBe('Bearer a-token');
  });

  it('says a deleted conversation is only gone from your side', async () => {
    stub();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    show();

    await userEvent.click(await screen.findByLabelText('Delete conversation'));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('bob keeps their copy'));
  });
});
