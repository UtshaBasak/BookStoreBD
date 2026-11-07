import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';

import type { ModerationFlagDetail, ModerationFlagItem, ModerationFlagList, ModerationStats, AssistantStats } from '@shared/api.js';

import SystemFlags from './SystemFlags.js';
import { setSession } from '../../utils/auth.js';
import { setLanguage } from '../../utils/language.js';

const DETAIL_TEXT = 'Contains a phone number and an outside link';

const flag = (over: Partial<ModerationFlagItem> = {}): ModerationFlagItem => ({
  _id: 'f1',
  targetType: 'listing',
  targetId: 'book-1',
  authorEmail: 'seller@test.com',
  label: 'Cheap phones',
  excerpt: 'Call me now',
  messageCount: 0,
  reasons: [{ code: 'contact-info', source: 'rule', score: 0.82, detail: DETAIL_TEXT }],
  score: 0.82,
  severity: 'high',
  status: 'open',
  shadow: false,
  decision: null,
  decidedBy: '',
  decidedAt: null,
  note: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  link: '/book/book-1',
  exists: true,
  ...over,
});

const list = (items: ModerationFlagItem[]): ModerationFlagList => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  mode: 'on',
});

const STATS: ModerationStats = {
  mode: 'on',
  open: { review: 0, 'seller-review': 0, listing: 1, chat: 0 },
  shadowOpen: 0,
  pendingJobs: 0,
  rules: [{ code: 'contact-info', decided: 4, actioned: 1, cleared: 3, precision: 0.25, open: 1 }],
};
const ASSISTANT: AssistantStats = {
  enabled: true,
  days: [],
  totals: { questions: 12, fallbacks: 2, handovers: 1, outOfScope: 3, helpful: 6, unhelpful: 2 },
  geminiToday: { assistant: 5, moderation: 2, limit: 100 },
};

let calls: { url: string; method: string; body: unknown }[];

const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const stub = (items: ModerationFlagItem[], detail?: Partial<ModerationFlagDetail>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes('/moderation/stats')) return ok(STATS);
      if (url.includes('/assistant/stats')) return ok(ASSISTANT);
      if (url.includes('/moderation/flags/clear')) return ok({ cleared: 1 });
      if (/\/moderation\/flags\/[^/?]+\/decision/.test(url)) return ok({ message: 'ok' });
      if (/\/moderation\/flags\/[^/?]+$/.test(url))
        return ok({ ...items[0], content: { title: 'Cheap phones', body: 'Call me now', rating: null, price: 500 }, messages: [], subjectId: null, ...detail });
      if (url.includes('/moderation/flags')) return ok(list(items));
      return ok({ message: 'done' });
    })
  );
};

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/admin/flags']}>
          <SystemFlags />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  calls = [];
  setLanguage('en');
  setSession({ token: 'a-token' });
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the list', () => {
  it('shows flags in English and Bangla, with the reason in words', async () => {
    stub([flag()]);
    renderPage();
    expect((await screen.findAllByText('Cheap phones')).length).toBeGreaterThan(0);
    expect(screen.getByText(DETAIL_TEXT)).toBeInTheDocument();
    expect(screen.getByText('Flagged by system')).toBeInTheDocument();
    expect(screen.getByText('Rule precision')).toBeInTheDocument();
    expect(await screen.findByText('Shopping assistant')).toBeInTheDocument();
  });

  it('is in Bangla when chosen', async () => {
    setLanguage('bn');
    stub([flag()]);
    renderPage();
    expect(await screen.findByText('সিস্টেমের ফ্ল্যাগ')).toBeInTheDocument();
    expect(screen.getByText('নিয়মের নির্ভুলতা')).toBeInTheDocument();
  });

  it('links only to pages on this site', async () => {
    stub([flag({ link: 'https://evil.example/x' })]);
    renderPage();
    await screen.findAllByText('Cheap phones');
    expect(screen.queryByRole('link', { name: /view on the site/i })).toBeNull();
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });

  it('links a relative path', async () => {
    stub([flag()]);
    renderPage();
    expect(await screen.findByRole('link', { name: /view on the site/i })).toHaveAttribute('href', '/book/book-1');
  });

  it('clears the selected flags after a confirmation', async () => {
    stub([flag()]);
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: /select flag: cheap phones/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear selected/i }));
    expect(calls.some((c) => c.url.includes('/flags/clear'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /yes, clear them/i }));
    await waitFor(() => {
      const post = calls.find((c) => c.url.includes('/flags/clear'));
      expect(post?.method).toBe('POST');
      expect(post?.body).toEqual({ ids: ['f1'] });
    });
  });
});

describe('the drawer', () => {
  it('"Looks fine" records a cleared decision', async () => {
    stub([flag()]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /take a look/i }));
    await userEvent.click(await screen.findByRole('button', { name: /looks fine/i }));
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/moderation/flags/f1/decision'));
      expect(post?.body).toEqual({ decision: 'cleared' });
    });
  });

  it('removes a listing through its own delete, then records the reason', async () => {
    stub([flag()]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /take a look/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    await userEvent.type(screen.getByLabelText(/reason, shown to the author/i), 'Not allowed');
    await userEvent.click(screen.getByRole('button', { name: /remove and tell the author/i }));
    await waitFor(() => {
      const del = calls.findIndex((c) => c.method === 'DELETE' && c.url.endsWith('/book/book-1'));
      const decision = calls.findIndex((c) => c.url.endsWith('/flags/f1/decision') && c.method === 'POST');
      expect(del).toBeGreaterThanOrEqual(0);
      expect(decision).toBeGreaterThan(del);
      expect(calls[decision].body).toEqual({ decision: 'removed', reason: 'Not allowed' });
    });
  });

  it('shows the audit notice for chat', async () => {
    const chat = flag({ targetType: 'chat', label: 'Chat by x', link: null, messageCount: 1 });
    stub([chat], {
      content: null,
      messages: [{ _id: 'm1', receiver: 'victim@test.com', message: 'buy now', hasImage: false, timestamp: '2026-01-01T00:00:00.000Z' }],
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /take a look/i }));
    expect(await screen.findByText(/recorded in the audit log/i)).toBeInTheDocument();
    expect(screen.getByText('buy now')).toBeInTheDocument();
  });
});
