import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { SuggestResponse } from '@shared/api.js';

import SearchField from './SearchField.js';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

const ANSWER: SuggestResponse = {
  books: [
    { _id: 'b1', title: 'Deyal', author: 'Humayun Ahmed', cover: null, price: 320, salePrice: 256, discountPercent: 20, inStock: true },
  ],
  sellers: [{ username: 'nadia_books', avatar: null, books: 14 }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  navigate.mockClear();
});

const renderField = (onSubmit = vi.fn()) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  );
  function Harness() {
    const [value, setValue] = useState('');
    return <SearchField value={value} onChange={setValue} onSubmit={onSubmit} inputProps={{ 'aria-label': 'Search books' }} />;
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return onSubmit;
};

describe('the search box', () => {
  it('suggests books and sellers as you type, and opens the one you choose', async () => {
    renderField();
    await userEvent.type(screen.getByRole('combobox', { name: 'Search books' }), 'দেয়াল');

    expect(await screen.findByRole('option', { name: /Deyal/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /nadia_books/ })).toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(navigate).toHaveBeenCalledWith('/book/b1');
  });

  it('searches for what was typed when nothing is highlighted', async () => {
    const onSubmit = renderField();
    await userEvent.type(screen.getByRole('combobox', { name: 'Search books' }), 'deyal{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('deyal');
    expect(navigate).not.toHaveBeenCalled();
  });
});
