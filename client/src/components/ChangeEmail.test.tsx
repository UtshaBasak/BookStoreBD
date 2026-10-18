/**
 * Changing the e-mail address: the new address and the password, then the
 * code sent there - and the page carries on signed in under the new address.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ChangeEmail from './ChangeEmail.js';
import { getUserEmail, setSession } from '../utils/auth.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const show = (passwordSet = true) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <ChangeEmail currentEmail="old@test.com" passwordSet={passwordSet} />
      </SnackbarProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: 'old@test.com', role: 'user' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('changing the e-mail address', () => {
  it('sends a code to the new address, and moves the session once it is entered', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) =>
      Promise.resolve(
        String(input).endsWith('/user/me/email')
          ? json({ message: 'We have e-mailed a code to new@test.com.', pendingEmail: 'new@test.com' })
          : json({ message: 'Your account now uses new@test.com.', email: 'new@test.com' })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    show();

    await userEvent.click(screen.getByRole('button', { name: /change e-mail address/i }));
    await userEvent.type(screen.getByLabelText('New e-mail address'), 'new@test.com');
    await userEvent.type(screen.getByLabelText('Your password'), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /send a code/i }));
    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /confirm new address/i }));

    await waitFor(() => expect(getUserEmail()).toBe('new@test.com'));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ newEmail: 'new@test.com', password: 'hunter2' });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ code: '123456' });
  });

  it('says what was wrong, and moves nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Another account already uses that address.' }, 409)));
    show();

    await userEvent.click(screen.getByRole('button', { name: /change e-mail address/i }));
    await userEvent.type(screen.getByLabelText('New e-mail address'), 'taken@test.com');
    await userEvent.type(screen.getByLabelText('Your password'), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /send a code/i }));

    expect(await screen.findByText('Another account already uses that address.')).toBeInTheDocument();
    expect(getUserEmail()).toBe('old@test.com');
  });

  it('asks an account made through Google to set a password first', async () => {
    vi.stubGlobal('fetch', vi.fn());
    show(false);

    await userEvent.click(screen.getByRole('button', { name: /change e-mail address/i }));

    expect(screen.getByText(/Choose a password below and save/)).toBeInTheDocument();
    expect(screen.queryByLabelText('New e-mail address')).not.toBeInTheDocument();
  });
});
