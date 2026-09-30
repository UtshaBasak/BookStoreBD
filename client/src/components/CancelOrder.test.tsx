import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CancelOrder, { CancelledNote } from './CancelOrder.js';

afterEach(() => vi.unstubAllGlobals());

describe('CancelOrder', () => {
  it('asks twice, then sends the reason to the cancel endpoint', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'Order cancelled' }), { status: 200 }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <CancelOrder orderNumber="ORDER1" who="buyer" />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /cancel this order/i }));
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox'), 'Ordered twice');
    await userEvent.click(screen.getByRole('button', { name: /yes, cancel/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('/order/ORDER1/cancel');
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Ordered twice' });
  });
});

describe('CancelledNote', () => {
  it('says who cancelled and why', () => {
    render(
      <CancelledNote
        lines={[
          {
            _id: 'l1',
            orderNumber: 'ORDER1',
            status: 'Cancelled',
            buyerEmail: 'b@x.com',
            sellerEmail: 's@x.com',
            bookId: 'b1',
            cancelledBy: 'seller',
            cancelReason: 'Damaged copy',
          },
        ]}
      />
    );

    expect(screen.getByText(/this order was cancelled/i)).toBeInTheDocument();
    expect(screen.getByText(/by the seller/i)).toBeInTheDocument();
    expect(screen.getByText(/damaged copy/i)).toBeInTheDocument();
  });
});
