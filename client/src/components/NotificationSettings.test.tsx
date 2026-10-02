import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

import type { NotificationSettings as Settings } from '@shared/api.js';

import NotificationSettings from './NotificationSettings.js';
import { setSession } from '../utils/auth.js';

const SETTINGS: Settings = {
  categories: [
    { id: 'orders', label: 'Orders', description: 'Order news.', emailAvailable: true, inApp: true, email: true },
    { id: 'payouts', label: 'Payouts', description: 'Payouts.', emailAvailable: false, inApp: true, email: false },
  ],
};

const show = () => {
  const fetchMock = vi.fn<typeof fetch>((_input, init) => {
    const body = init?.method === 'PUT' ? { categories: [{ ...SETTINGS.categories[0], email: false }, SETTINGS.categories[1]] } : SETTINGS;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fetchMock);
  setSession({ token: 'a-token' });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter>
          <NotificationSettings />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('notification settings', () => {
  it('shows a switch per channel, and none for e-mail where nothing is e-mailed', async () => {
    show();
    expect(await screen.findByRole('switch', { name: 'Orders by e-mail' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Payouts in the app' })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Payouts by e-mail' })).not.toBeInTheDocument();
  });

  it('saves a switch as it is flipped', async () => {
    const fetchMock = show();
    await userEvent.click(await screen.findByRole('switch', { name: 'Orders by e-mail' }));

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Orders by e-mail' })).toHaveAttribute('aria-checked', 'false'));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ prefs: { orders: { inApp: true, email: false } } });
  });
});
