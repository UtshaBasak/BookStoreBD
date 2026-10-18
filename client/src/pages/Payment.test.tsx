/**
 * Checkout: the contact fields keep what is typed, a confirmation belongs to
 * its own order, "Confirm Order" places one order however often it is
 * pressed, and the confirmation shows the order as the server placed it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Payment from './Payment.js';
import { clearSession, setSession } from '../utils/auth.js';
import { CONFIRMED_ORDER_KEY, bdMobile } from '../utils/checkout.js';

const EMAIL = 'buyer@test.com';
const ORDER = 'ABCDEFGH12345678';

const BOOK = {
  _id: 'book-1',
  title: 'Pather Panchali',
  author: 'Bibhutibhushan Bandyopadhyay',
  bookType: 'old',
  price: 450,
  salePrice: 450,
  stock: 3,
  cartQuantity: 2,
  sellerEmail: 'seller@test.com',
  images: [],
};

const PROFILE = {
  username: 'rahim',
  email: EMAIL,
  role: 'user',
  phone: '01711112222',
  address: 'House 1, Road 2, Dhanmondi',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Placed {
  body: Record<string, unknown>;
}

/**
 * The shop, answering checkout. `answer` decides what placing an order
 * returns; every order sent is recorded in `placed`.
 */
const stubShop = (answer: () => Promise<Response> | Response = () => json({
  message: 'Stock updated & order saved',
  orderNumber: ORDER,
  shippingCharge: 70,
  discount: 0,
  unavailable: [],
})) => {
  const placed: Placed[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/order/decrease-stock')) {
        placed.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return answer();
      }
      if (url.includes(`/order/${ORDER}`)) {
        return json({
          orderNumber: ORDER,
          status: 'Order Confirmed',
          books: [{ _id: 'line-1', bookId: 'book-1', title: 'Pather Panchali', author: 'B.', price: 400, quantity: 1, status: 'Order Confirmed' }],
          booksTotal: 400,
          shippingCost: 70,
          discount: 0,
          totalCost: 470,
          promo: '',
          promoApplied: false,
          canCancel: true,
          statusOptions: [],
        });
      }
      if (url.includes('/user/profile')) return json(PROFILE);
      if (url.includes('/cart/clear')) return json({ message: 'Cart cleared' });
      if (url.endsWith('/cart')) return json([BOOK]);
      return json({});
    })
  );
  return placed;
};

/** Where the page has gone, so a test can see a redirect. */
function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
}

const renderAt = (path = '/payment') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/payment" element={<><Payment /><Where /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const chooseDhaka = async () => {
  await userEvent.selectOptions(screen.getByLabelText('Division'), 'Dhaka');
  await userEvent.selectOptions(screen.getByLabelText('District'), 'Dhaka');
};

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: EMAIL } });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('the contact details', () => {
  it('start from the profile and keep what is typed', async () => {
    stubShop();
    renderAt();

    const name = await screen.findByDisplayValue('rahim');
    await userEvent.clear(name);
    await userEvent.type(name, 'Rahim Uddin');
    const phone = screen.getByLabelText('Phone number');
    await userEvent.clear(phone);

    expect(name).toHaveValue('Rahim Uddin');
    // Emptied stays empty, rather than snapping back to the profile.
    expect(phone).toHaveValue('');
    expect(screen.getByLabelText('Address')).toHaveValue('House 1, Road 2, Dhanmondi');
  });

  it("show the account's e-mail without letting it be edited", async () => {
    stubShop();
    renderAt();

    const field = await screen.findByLabelText('Email address');

    expect(field).toHaveValue(EMAIL);
    expect(field).toHaveAttribute('readonly');
  });

  it('accept a phone number written with +880 and send it in the eleven-digit form', async () => {
    const placed = stubShop();
    renderAt();
    const phone = await screen.findByLabelText('Phone number');
    expect(phone).toHaveAttribute('type', 'tel');
    await userEvent.clear(phone);
    await userEvent.type(phone, '+880 1712-345678');
    await chooseDhaka();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Order' }));

    await waitFor(() => expect(placed).toHaveLength(1));
    expect(placed[0]?.body).toMatchObject({ contactPhone: '01712345678', contactName: 'rahim' });
  });

  it('refuse a number that is not a mobile number, before anything is sent', async () => {
    const placed = stubShop();
    renderAt();
    const phone = await screen.findByLabelText('Phone number');
    await userEvent.clear(phone);
    await userEvent.type(phone, '12345');
    await chooseDhaka();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Order' }));

    expect(await screen.findByText(/so the courier can call you/)).toBeInTheDocument();
    expect(placed).toHaveLength(0);
  });
});

describe('Confirm Order', () => {
  it('places one order, however often it is pressed, with a checkout id', async () => {
    let release: (response: Response) => void = () => undefined;
    const placed = stubShop(() => new Promise<Response>((resolve) => { release = resolve; }));
    renderAt();
    await screen.findByDisplayValue('rahim');
    await chooseDhaka();

    const button = screen.getByRole('button', { name: 'Confirm Order' });
    await userEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Placing your order…' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Placing your order…' }));
    release(json({ message: 'ok', orderNumber: ORDER, shippingCharge: 70, discount: 0, unavailable: [] }));

    expect(await screen.findByText('Checkout Complete!', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(placed).toHaveLength(1);
    expect(placed[0]?.body.checkoutId).toEqual(expect.any(String));
  });

  it('sends the same checkout id again when the first try got no answer', async () => {
    let tries = 0;
    const placed = stubShop(() => {
      tries += 1;
      if (tries === 1) return Promise.reject(new TypeError('Failed to fetch'));
      return json({ message: 'ok', orderNumber: ORDER, shippingCharge: 70, discount: 0, unavailable: [], replayed: true });
    });
    renderAt();
    await screen.findByDisplayValue('rahim');
    await chooseDhaka();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Order' }));
    await screen.findByText(/Could not reach the shop/);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Order' }));

    await screen.findByText('Checkout Complete!', {}, { timeout: 5000 });
    expect(placed).toHaveLength(2);
    expect(placed[1]?.body.checkoutId).toBe(placed[0]?.body.checkoutId);
  });
});

describe('the confirmation', () => {
  it('shows the order as placed, the books left out, and a code that was not applied', async () => {
    stubShop(() => json({
      message: 'ok',
      orderNumber: ORDER,
      shippingCharge: 70,
      discount: 0,
      promoMessage: 'That code is for a first order only.',
      unavailable: [{ bookId: 'book-2', title: 'Aranyak', available: 0, requested: 1, reserved: 0, reason: 'sold-out' }],
    }));
    renderAt();
    await screen.findByDisplayValue('rahim');
    await chooseDhaka();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm Order' }));

    await screen.findByText('Checkout Complete!', {}, { timeout: 5000 });
    expect(screen.getByText(/Aranyak \(sold out\)/)).toBeInTheDocument();
    expect(screen.getByText(/was not applied: That code is for a first order only\./)).toBeInTheDocument();
    // The server's figures, not the cart's 2 × 450.
    expect(await screen.findByText('৳470.00', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(`/payment?order=${ORDER}`);
  });

  it('comes back on a reload of its own page', async () => {
    stubShop();
    sessionStorage.setItem(CONFIRMED_ORDER_KEY, JSON.stringify({
      email: EMAIL, orderNumber: ORDER, division: 'Dhaka', district: 'Dhaka', address: 'House 1',
      discount: 0, shippingCharge: 70, promo: '', promoApplied: false, quantities: { 'book-1': 1 }, cartBooks: [BOOK],
    }));

    renderAt(`/payment?order=${ORDER}`);

    expect(await screen.findByText('Checkout Complete!', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('does not come back on the next visit to checkout', async () => {
    stubShop();
    sessionStorage.setItem(CONFIRMED_ORDER_KEY, JSON.stringify({
      email: EMAIL, orderNumber: ORDER, division: 'Dhaka', district: 'Dhaka', address: 'House 1',
      discount: 0, shippingCharge: 70, promo: '', promoApplied: false, quantities: {}, cartBooks: [BOOK],
    }));
    // Where an older version of the page left one.
    localStorage.setItem(CONFIRMED_ORDER_KEY, sessionStorage.getItem(CONFIRMED_ORDER_KEY) ?? '');

    renderAt('/payment');

    expect(await screen.findByRole('button', { name: 'Confirm Order' })).toBeInTheDocument();
    expect(screen.queryByText('Checkout Complete!')).not.toBeInTheDocument();
  });

  it('opened without its stored copy goes to the order', async () => {
    stubShop();

    renderAt(`/payment?order=${ORDER}`);

    expect(await screen.findByTestId('where')).toHaveTextContent(`/order-tracking/${ORDER}`);
  });

  it('is forgotten on signing out', () => {
    sessionStorage.setItem(CONFIRMED_ORDER_KEY, '{}');
    localStorage.setItem(CONFIRMED_ORDER_KEY, '{}');

    clearSession();

    expect(sessionStorage.getItem(CONFIRMED_ORDER_KEY)).toBeNull();
    expect(localStorage.getItem(CONFIRMED_ORDER_KEY)).toBeNull();
  });
});

describe('the total', () => {
  it('says it is before delivery until a district is chosen', async () => {
    stubShop();
    renderAt();
    await screen.findByDisplayValue('rahim');

    expect(screen.getAllByText('Total before delivery').length).toBeGreaterThan(0);
    await chooseDhaka();
    expect(screen.queryByText('Total before delivery')).not.toBeInTheDocument();
    expect(screen.getByText('To pay on delivery')).toBeInTheDocument();
  });
});

describe('bdMobile', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+880 1712-345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['01212345678', null],
    ['12345', null],
  ])('reads %s as %s', (input, expected) => {
    expect(bdMobile(input)).toBe(expected);
  });
});
