import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';

import SessionsSetting from './SessionsSetting.js';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('signing out everywhere else', () => {
  it('asks the server to end the other sessions, and says how it went', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Signed out everywhere else.', ended: 2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('authToken', 'a-token');
    render(
      <SnackbarProvider>
        <SessionsSetting />
      </SnackbarProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere else' }));

    expect(await screen.findByText('Signed out everywhere else.')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/logout-others$/);
    expect(init?.method).toBe('POST');
  });
});
