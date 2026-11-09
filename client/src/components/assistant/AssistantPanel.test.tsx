import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AssistantReply, Book } from '@shared/api.js';

import AssistantPanel from './AssistantPanel.js';

const BOOK = {
  _id: '0123456789abcdef01234567',
  title: 'Sapiens',
  author: 'Yuval Noah Harari',
  price: 650,
  stock: 3,
  bookType: 'old',
  condition: 'good',
  images: [],
} as unknown as Book;

const reply = (patch: Partial<AssistantReply> = {}): AssistantReply => ({
  requestId: 'req-1',
  reply: 'Returns are accepted for 7 days.',
  language: 'en',
  books: [],
  links: [],
  orders: [],
  handover: null,
  wanted: null,
  fallback: false,
  outOfScope: false,
  ...patch,
});

const answer = (status: number, body: unknown) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })));

const renderPanel = (fetchMock = answer(200, reply()), onClose = vi.fn()) => {
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <MemoryRouter>
        <AssistantPanel onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { fetchMock, onClose };
};

const ask = async (text: string) => {
  await userEvent.type(screen.getByRole('textbox', { name: /your question|আপনার প্রশ্ন/i }), `${text}{Enter}`);
};

const bodyOf = (fetchMock: ReturnType<typeof answer>, path: string) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes(path));
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
};

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('the assistant panel', () => {
  it('renders in English, with the AI note, and focuses the box', () => {
    renderPanel();
    expect(screen.getByRole('dialog', { name: 'BookStoreBD assistant' })).toBeInTheDocument();
    expect(screen.getByText(/AI assistant – may make mistakes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'What is shared' })).toHaveAttribute('href', '/privacy#assistant');
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'How do returns work?' })).toBeInTheDocument();
  });

  it('renders in Bangla', () => {
    localStorage.setItem('language', 'bn');
    renderPanel();
    expect(screen.getByRole('dialog', { name: 'BookStoreBD সহকারী' })).toBeInTheDocument();
    expect(screen.getByText(/এআই সহকারী – ভুল হতে পারে/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'রিটার্ন কীভাবে কাজ করে?' })).toBeInTheDocument();
  });

  it('sends the question and shows the reply as plain text, never as HTML', async () => {
    const { fetchMock } = renderPanel(answer(200, reply({ reply: '<img src=x onerror=alert(1)>\nSecond line' })));
    await ask('hello');

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('Second line')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(bodyOf(fetchMock, '/assistant/chat')).toMatchObject({ message: 'hello', history: [] });
  });

  it('sends recently viewed books while personalisation is allowed', async () => {
    localStorage.setItem('recentlyViewed', JSON.stringify([BOOK._id]));
    const { fetchMock } = renderPanel();
    await ask('one');
    await screen.findByText('Returns are accepted for 7 days.');
    expect(bodyOf(fetchMock, '/assistant/chat').seen).toEqual([BOOK._id]);
  });

  it('does not send recently viewed books without consent', async () => {
    localStorage.setItem('recentlyViewed', JSON.stringify([BOOK._id]));
    localStorage.setItem('consent', JSON.stringify({ version: 1, at: '', preferences: false, personalisation: false, diagnostics: false }));
    const { fetchMock } = renderPanel();
    await ask('one');
    await screen.findByText('Returns are accepted for 7 days.');
    expect(bodyOf(fetchMock, '/assistant/chat').seen).toBeUndefined();
  });

  it('draws books from the reply as book cards', async () => {
    renderPanel(answer(200, reply({ books: [BOOK] })));
    await ask('a book');
    expect(await screen.findByRole('link', { name: 'Sapiens' })).toHaveAttribute('href', `/book/${BOOK._id}`);
  });

  it('keeps links on this site and drops the rest', async () => {
    renderPanel(
      answer(
        200,
        reply({
          links: [
            { href: '/returns', label: 'Returns policy' },
            { href: 'https://evil.example', label: 'Evil' },
            { href: '//evil.example', label: 'Protocol relative' },
          ],
        })
      )
    );
    await ask('policy');
    expect(await screen.findByRole('link', { name: 'Returns policy' })).toHaveAttribute('href', '/returns');
    expect(screen.queryByRole('link', { name: 'Evil' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Protocol relative' })).toBeNull();
  });

  it('closes on Escape', async () => {
    const { onClose } = renderPanel();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server message and the search link for the daily limit', async () => {
    renderPanel(answer(429, { code: 'assistant-daily-limit', message: 'You have asked a lot of questions today.' }));
    await ask('more');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('You have asked a lot of questions today.')).toBeInTheDocument();
    expect(within(alert).getByRole('link', { name: 'Search the shop for this' })).toHaveAttribute('href', '/filter?search=more');
    expect(within(alert).getByRole('link', { name: 'How BookStoreBD works' })).toHaveAttribute('href', '/how-it-works');
  });

  it('offers a retry for other errors', async () => {
    renderPanel(answer(500, { message: 'Boom' }));
    await ask('x');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says the assistant is busy after a fallback answer, and offers the chips', async () => {
    renderPanel(answer(200, reply({ fallback: true })));
    await ask('help');
    expect(await screen.findByText(/assistant is busy right now/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Track my order' })).toBeInTheDocument();
  });

  it('thanks the reader for feedback and records the reason after a thumbs down', async () => {
    const { fetchMock } = renderPanel();
    await ask('hi');
    await screen.findByText('Returns are accepted for 7 days.');
    await userEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    await userEvent.click(screen.getByRole('button', { name: 'Wrong answer' }));
    expect(await screen.findByText('Thanks for the feedback.')).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/assistant/feedback')).toEqual({ requestId: 'req-1', helpful: false, reason: 'wrong' });
  });
});
