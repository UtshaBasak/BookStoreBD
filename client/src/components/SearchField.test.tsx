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
  authors: [{ name: 'Humayun Ahmed', books: 9 }],
  categories: [],
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

  it('completes the top match with Tab', async () => {
    renderField();
    const box = screen.getByRole('combobox', { name: 'Search books' });
    await userEvent.type(box, 'Huma');
    await screen.findByRole('option', { name: /Author/ });
    await userEvent.keyboard('{Tab}');
    expect(box).toHaveValue('Humayun Ahmed');
  });

  it('offers recent searches before anything is typed, and remembers new ones', async () => {
    localStorage.setItem('recentSearches', JSON.stringify(['physics']));
    const onSubmit = renderField();
    const box = screen.getByRole('combobox', { name: 'Search books' });
    await userEvent.click(box);
    await userEvent.click(await screen.findByRole('option', { name: 'physics' }));
    expect(onSubmit).toHaveBeenCalledWith('physics');

    await userEvent.clear(box);
    await userEvent.type(box, 'deyal{Enter}');
    expect(JSON.parse(localStorage.getItem('recentSearches') ?? '[]')).toEqual(['deyal', 'physics']);
    localStorage.clear();
  });

  it('searches by voice where the browser can listen, and says nothing where it cannot', async () => {
    renderField();
    expect(screen.queryByRole('button', { name: /search by voice/i })).not.toBeInTheDocument();
  });

  it('turns speech into a search', async () => {
    class FakeRecognition {
      lang = '';
      interimResults = false;
      maxAlternatives = 1;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: 'pather panchali' }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
          this.onend?.();
        }, 10);
      }
      stop() {}
      abort() {}
    }
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
    const onSubmit = renderField();
    await userEvent.click(screen.getByRole('button', { name: /search by voice/i }));
    // Both inside the wait: the search is sent the moment the words arrive,
    // and React may not have drawn them in the box yet when it is.
    await vi.waitFor(
      () => {
        expect(onSubmit).toHaveBeenCalledWith('pather panchali');
        expect(screen.getByRole('combobox', { name: 'Search books' })).toHaveValue('pather panchali');
      },
      { timeout: 5000 }
    );
  });
});
