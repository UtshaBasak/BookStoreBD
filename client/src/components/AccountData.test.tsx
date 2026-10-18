/**
 * A user could not get a copy of their data and could not close their account:
 * the API had no route for either, and the profile page said nothing about it.
 * These pin the controls that now say otherwise.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AccountData from './AccountData.js';
import { keys } from '../hooks/queries.js';
import { getToken, setSession } from '../utils/auth.js';

/** The page, for an account with a password - or, with `passwordSet: false`, one made through Google. */
const show = ({ passwordSet = true } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(keys.profile('someone@test.com'), {
    username: 'someone',
    email: 'someone@test.com',
    profilePicture: null,
    role: 'user',
    passwordSet,
  });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/profile" element={<AccountData />} />
            <Route path="/" element={<h1>Homepage</h1>} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  setSession({ token: 'a-token' });
  localStorage.setItem('userEmail', 'someone@test.com');
  // jsdom has no download machinery; the test is about the request and what
  // happens after it, not about the browser writing a file.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloading your data', () => {
  it('asks the API for it and says so', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ account: { email: 'someone@test.com' } }));
    vi.stubGlobal('fetch', fetchMock);
    show();

    await userEvent.click(screen.getByRole('button', { name: /download my data/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('/user/me/export');
    expect(await screen.findByRole('alert')).toHaveTextContent(/downloading/i);
  });
});

describe('deleting your account', () => {
  it('does not offer the button until it is asked for', () => {
    vi.stubGlobal('fetch', vi.fn());
    show();

    expect(screen.queryByLabelText(/enter your password/i)).not.toBeInTheDocument();
  });

  it('asks for the password before it will do anything', async () => {
    vi.stubGlobal('fetch', vi.fn());
    show();

    await userEvent.click(screen.getByRole('button', { name: /^delete my account$/i }));

    const confirm = screen.getByRole('button', { name: /for good/i });
    // Irreversible: the confirm stays out of reach until a password is typed.
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/enter your password/i), 'hunter2');
    expect(confirm).toBeEnabled();
  });

  it('sends the password and leaves for the homepage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ message: 'Your account has been deleted.' }));
    vi.stubGlobal('fetch', fetchMock);
    show();

    await userEvent.click(screen.getByRole('button', { name: /^delete my account$/i }));
    await userEvent.type(screen.getByLabelText(/enter your password/i), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /for good/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Homepage' })).toBeInTheDocument());

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/user\/me$/);
    expect((init as RequestInit).method).toBe('DELETE');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ password: 'hunter2' });
    // The session goes with the account.
    expect(getToken()).toBeNull();
  });

  it('says what went wrong and keeps the session when the password is refused', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      // 403, deliberately: a 401 would send `apiFetch` off to refresh the
      // session and then sign the user out over a typo.
      new Response(JSON.stringify({ message: 'That password is not correct' }), { status: 403 })
    );
    vi.stubGlobal('fetch', fetchMock);
    show();

    await userEvent.click(screen.getByRole('button', { name: /^delete my account$/i }));
    await userEvent.type(screen.getByLabelText(/enter your password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /for good/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/i);
    expect(getToken()).toBe('a-token');
  });

  it('can be backed out of', async () => {
    vi.stubGlobal('fetch', vi.fn());
    show();

    await userEvent.click(screen.getByRole('button', { name: /^delete my account$/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep my account/i }));

    expect(screen.queryByLabelText(/enter your password/i)).not.toBeInTheDocument();
  });

  it('says what has to finish first when the shop cannot close it yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'account-has-open-business',
            message: "Your account can't be closed just yet.",
            blockers: ['Order ABC is being prepared or is on its way to you.'],
          }),
          { status: 409 }
        )
      )
    );
    show();

    await userEvent.click(screen.getByRole('button', { name: /^delete my account$/i }));
    await userEvent.type(screen.getByLabelText(/enter your password/i), 'hunter2');
    await userEvent.click(screen.getByRole('button', { name: /for good/i }));

    expect(await screen.findByText(/Order ABC is being prepared/)).toBeInTheDocument();
    expect(getToken()).toBe('a-token');
  });

  it('confirms with an e-mailed code for an account made through Google', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) =>
      Promise.resolve(
        String(input).includes('/confirm-code')
          ? ok({ message: 'We have e-mailed a code to someone@test.com.' })
          : ok({ message: 'Your account has been deleted.' })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    show({ passwordSet: false });

    await userEvent.click(screen.getByRole('button', { name: /^delete my account$/i }));
    expect(screen.queryByLabelText(/enter your password/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /e-mail me a code/i }));
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /for good/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Homepage' })).toBeInTheDocument());
    const deleted = fetchMock.mock.calls.find(([url]) => /\/user\/me$/.test(String(url)));
    expect(JSON.parse(String((deleted?.[1] as RequestInit).body))).toEqual({ code: '123456' });
  });
});
