/**
 * The administrator's record of paying sellers. There was none: nothing said
 * what a seller was owed, where to send it, or whether it had gone.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';

import type { PayoutPage, PayoutRow } from '@shared/api.js';

import SellerPayouts from './SellerPayouts.js';

const ROW: PayoutRow = {
  orderNumber: 'ORDER00000000001',
  sellerEmail: 'seller@test.com',
  sellerName: 'rahim',
  bkashMerchant: '01812345678',
  titles: ['Pather Panchali'],
  booksTotal: 850,
  fee: 42.5,
  payout: 807.5,
  deliveredAt: '2026-09-01T00:00:00.000Z',
  payableFrom: '2026-09-08T00:00:00.000Z',
  paidAt: null,
  reference: null,
};

const page = (items: PayoutRow[]): PayoutPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
  pageCount: 1,
});

let sent: { url: string; method: string; body: unknown }[];

const stub = (rows: PayoutRow[]) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      sent.push({
        url,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });
      const body = url.includes('/paid')
        ? { message: 'Recorded 807.50 Tk paid.', amount: 807.5 }
        : page(rows);
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    })
  );

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter>
          <SellerPayouts />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );

beforeEach(() => {
  sent = [];
  localStorage.setItem('authToken', 'a-token');
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('what is owed', () => {
  it('shows who to pay, where, and how much after the fee', async () => {
    stub([ROW]);
    renderPage();

    const row = (await screen.findByText('rahim')).closest('tr') as HTMLElement;
    expect(within(row).getByText('01812345678')).toBeInTheDocument();
    expect(within(row).getByText('807.50 Tk')).toBeInTheDocument();
    expect(within(row).getByText('-42.50 Tk')).toBeInTheDocument();
  });

  it('records a payment with its bKash transaction ID', async () => {
    stub([ROW]);
    renderPage();
    await screen.findByText('rahim');

    const button = screen.getByRole('button', { name: 'Mark paid' });
    // Not without the ID: every payment should be traceable.
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/bKash transaction ID/), '8N7A2B3C4D');
    await userEvent.click(button);

    await waitFor(() => expect(sent.some((r) => r.url.endsWith('/order/admin/payouts/paid'))).toBe(true));
    expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
      orderNumber: 'ORDER00000000001',
      sellerEmail: 'seller@test.com',
      reference: '8N7A2B3C4D',
    });
  });

  it('cannot be marked paid when the seller has not given a number', async () => {
    stub([{ ...ROW, bkashMerchant: null }]);
    renderPage();

    expect(await screen.findByText('Not given')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/bKash transaction ID/), '8N7A2B3C4D');
    expect(screen.getByRole('button', { name: 'Mark paid' })).toBeDisabled();
  });
});
