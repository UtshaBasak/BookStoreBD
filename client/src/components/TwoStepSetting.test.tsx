/**
 * Turning two-step sign-in off asks for the password - or, for an account
 * made through Google, which has none, a code e-mailed to it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import TwoStepSetting from './TwoStepSetting.js';
import { keys } from '../hooks/queries.js';
import { setSession } from '../utils/auth.js';

const EMAIL = 'someone@test.com';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const show = (passwordSet: boolean) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(keys.profile(EMAIL), { username: 'someone', email: EMAIL, profilePicture: null, role: 'user', twoFactor: true, passwordSet });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <TwoStepSetting />
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: EMAIL } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('turning two-step sign-in off', () => {
  it('asks an account with a password for it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ message: 'Two-step sign-in is off.', twoFactor: false }));
    vi.stubGlobal('fetch', fetchMock);
    show(true);

    await userEvent.click(screen.getByRole('button', { name: /turn it off/i }));
    await userEvent.type(screen.getByLabelText(/enter your password/i), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /^turn off$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ enabled: false, password: 'hunter2' });
  });

  it('sends an account made through Google a code instead', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) =>
      Promise.resolve(String(input).includes('/confirm-code') ? ok({ message: 'We have e-mailed a code.' }) : ok({ message: 'Two-step sign-in is off.' }))
    );
    vi.stubGlobal('fetch', fetchMock);
    show(false);

    await userEvent.click(screen.getByRole('button', { name: /turn it off/i }));
    await userEvent.click(screen.getByRole('button', { name: /e-mail me a code/i }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), '654321');
    await userEvent.click(screen.getByRole('button', { name: /^turn off$/i }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/two-factor'))).toBe(true));
    const sent = fetchMock.mock.calls.find(([url]) => String(url).includes('/two-factor'));
    expect(JSON.parse(String((sent?.[1] as RequestInit).body))).toEqual({ enabled: false, code: '654321' });
  });
});
