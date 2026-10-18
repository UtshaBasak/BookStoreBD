/**
 * The cart counts the books one way, the copies ready for checkout, names
 * the sold-out ones apart, and says its total is before delivery.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Cart from './Cart.js';
import { setSession } from '../utils/auth.js';

const book = (id: string, title: string, stock: number, cartQuantity: number) => ({
  _id: id,
  title,
  author: 'An Author',
  bookType: 'old',
  price: 200,
  salePrice: 200,
  stock,
  cartQuantity,
  sellerEmail: 'seller@test.com',
  images: [],
});

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: 'buyer@test.com' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/cart')
        ? json([book('a', 'Deyal', 5, 2), book('b', 'Sapiens', 4, 1), book('c', 'Aranyak', 0, 1)])
        : json({})
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the cart', () => {
  it('counts the copies ready for checkout and names the sold-out books apart', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Cart />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText('3 books ready for checkout, 1 sold out')).toBeInTheDocument();
    expect(screen.getByText('Subtotal (3 books)')).toBeInTheDocument();
    expect(screen.getByText('Total before delivery')).toBeInTheDocument();
    expect(screen.getAllByText('৳600.00').length).toBeGreaterThan(0);
  });
});
