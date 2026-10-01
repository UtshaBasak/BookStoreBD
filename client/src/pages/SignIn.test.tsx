/**
 * The sign-in page: two-step sign-in, where a right password asks
 * for the e-mailed code, and the way back from "Continue with Google".
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import SignIn from './SignIn.js';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const SESSION = { token: 'header.eyJlbWFpbCI6InJlYWRlckB0ZXN0LmNvbSIsInJvbGUiOiJ1c2VyIn0.sig', user: { id: 'u1', username: 'reader', email: 'reader@test.com', role: 'user' } };

const show = (entry = '/sign-in') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/" element={<h1>Home page</h1>} />
            <Route path="/wishlist" element={<h1>Wishlist page</h1>} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );

/** What the sign-in page is told it may offer. */
const CONFIG = { captchaSiteKey: null, google: false };

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const fillAndSubmit = async () => {
  await userEvent.type(screen.getByLabelText('Email'), 'reader@test.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Tangerine-Lantern-42!');
  await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
};

describe('two-step sign-in', () => {
  it('asks for the e-mailed code, then signs in with it', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) =>
      String(input).includes('/auth/config')
        ? json(CONFIG)
        : String(input).includes('/auth/signin/verify')
          ? json(SESSION)
          : json({ twoFactor: true, sentTo: 'r•••@test.com', message: 'Enter the code' })
    );
    vi.stubGlobal('fetch', fetchMock);
    show();

    await fillAndSubmit();
    expect(await screen.findByRole('heading', { name: /check your e-mail/i })).toBeInTheDocument();
    expect(screen.getByText(/enter the 6-digit code we sent to r•••@test\.com/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/sign-in code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    expect(await screen.findByRole('heading', { name: /home page/i })).toBeInTheDocument();
    const verify = fetchMock.mock.calls.find(([input]) => String(input).includes('/auth/signin/verify'));
    expect(JSON.parse(String(verify?.[1]?.body))).toEqual({ email: 'reader@test.com', code: '123456' });
  });

  it('says so when the code is wrong, and stays on the code step', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((input) =>
        String(input).includes('/auth/config')
          ? json(CONFIG)
          : String(input).includes('/verify')
            ? json({ message: 'Invalid or expired code' }, 400)
            : json({ twoFactor: true, sentTo: 'r•••@test.com', message: 'Enter the code' })
      )
    );
    show();

    await fillAndSubmit();
    await userEvent.type(await screen.findByLabelText(/sign-in code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => expect(screen.getByText(/invalid or expired code/i)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: /check your e-mail/i })).toBeInTheDocument();
  });

  it('signs straight in when two-step is off', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>((input) => (String(input).includes('/auth/config') ? json(CONFIG) : json(SESSION))));
    show();

    await fillAndSubmit();
    expect(await screen.findByRole('heading', { name: /home page/i })).toBeInTheDocument();
  });
});

describe('Continue with Google', () => {
  it('is offered when the site has it, and goes through the API', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => json({ captchaSiteKey: null, google: true })));
    show();
    expect(await screen.findByRole('link', { name: /continue with google/i })).toHaveAttribute('href', '/api/auth/google?next=%2F');
  });

  it('finishes signing in on the way back, and goes where the visitor was headed', async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => (String(input).includes('/auth/refresh') ? json(SESSION) : json(CONFIG)));
    vi.stubGlobal('fetch', fetchMock);
    show('/sign-in?google=done&next=%2Fwishlist');
    expect(await screen.findByRole('heading', { name: /wishlist page/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/auth/refresh'))).toBe(true);
  });

  it('asks for the code when two-step sign-in is on', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => json(CONFIG)));
    show('/sign-in#google-2fa=reader%40test.com');
    expect(await screen.findByRole('heading', { name: /check your e-mail/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /send a new code/i })).toHaveAttribute('href', '/api/auth/google?next=%2F');
  });

  it('says why when it did not work', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => json(CONFIG)));
    show('/sign-in#google-error=cancelled');
    expect(await screen.findByText(/google sign-in was cancelled/i)).toBeInTheDocument();
  });
});
