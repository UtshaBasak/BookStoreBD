/**
 * Adding a book failed for everybody, and the page said only "Submission
 * failed".
 *
 * The session token was stored under `authToken`. This page kept its own copy of the
 * header-building code, reading `token` - a key nothing has written since the
 * session moved into utils/auth - so every submission went out as
 * `Bearer null` and the API refused it. The upload to Cloudinary happened
 * first, so each attempt also left an orphaned image behind.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AddBooks from './AddBook.js';
import { uploadImages } from '../utils/uploadImages.js';
import { setSession } from '../utils/auth.js';

// The bytes go straight to Cloudinary from the browser; what is being tested
// is the request that follows, so this stands in for that round trip.
vi.mock('../utils/uploadImages.js', () => ({
  uploadImages: vi.fn().mockResolvedValue({
    hosted: true,
    images: ['https://res.cloudinary.com/demo/image/upload/v1/cover.png'],
    publicIds: ['bookstorebd/books/cover'],
  }),
}));

/** What the page posts to the API, and what the API says back. */
const postMock = vi.fn<(url: string, init: RequestInit) => { status: number; body: unknown }>();
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const stubApi = (profile: unknown = { username: 'rahim', email: 'seller@test.com', role: 'user', bkashMerchant: '01710000001' }) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/user/add-book')) {
        const { status, body } = postMock(url, init ?? {});
        return json(status, body);
      }
      return json(200, profile);
    })
  );
const uploadMock = vi.mocked(uploadImages);

const fillAndSubmit = async () => {
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Title *'), 'Pather Panchali');
  await user.type(screen.getByLabelText('Author *'), 'Bibhutibhushan Bandyopadhyay');
  await user.type(screen.getByLabelText('Price (Taka) *'), '450');
  await user.click(screen.getByLabelText('Novels'));
  await user.upload(
    screen.getByLabelText(/book images/i),
    new File(['x'], 'cover.png', { type: 'image/png' })
  );

  await user.click(screen.getByRole('button', { name: 'Submit' }));
};

beforeEach(() => {
  postMock.mockReset();
  postMock.mockReturnValue({ status: 201, body: { message: 'Book added successfully!' } });
  stubApi();
  uploadMock.mockClear();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AddBooks />
      </MemoryRouter>
    </QueryClientProvider>
  );

/**
 * A seller has to be payable before listing. The API refuses otherwise, and
 * the form says so up front instead of after the photographs are uploaded.
 */
describe('a seller with no bKash merchant number', () => {
  const profileWithout = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ username: 'rahim', email: 'seller@test.com', role: 'user', bkashMerchant: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
      )
    );

  afterEach(() => vi.unstubAllGlobals());

  it('is told before filling the form in, with a way to add one', async () => {
    setSession({ token: 'a-token' });
    localStorage.setItem('userEmail', 'seller@test.com');
    profileWithout();
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/bKash merchant number/);
    expect(screen.getByRole('link', { name: /add it now/i })).toHaveAttribute(
      'href',
      '/update-profile#bkash'
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('submitting a listing', () => {
  it('sends the session the rest of the app uses', async () => {
    setSession({ token: 'a-real-token' });
    renderPage();

    await fillAndSubmit();

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));

    const [url, init] = postMock.mock.calls[0];
    expect(url).toMatch(/\/user\/add-book$/);
    // `Bearer null` is what this page's own copy of the header code used to send.
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer a-real-token');
    expect(await screen.findByText('Book added successfully!')).toBeInTheDocument();

    const form = init.body as FormData;
    expect(form.get('title')).toBe('Pather Panchali');
    expect(form.get('images')).toBe('https://res.cloudinary.com/demo/image/upload/v1/cover.png');
  });


  it('repeats the field the API rejected, not just that it failed', async () => {
    setSession({ token: 'a-real-token' });
    postMock.mockReturnValue({
      status: 400,
      body: { message: 'Validation failed', errors: [{ path: 'body.pages', message: 'Invalid input' }] },
    });
    renderPage();

    await fillAndSubmit();

    // "Submission failed: Validation failed" was the whole of it before, in
    // front of a twelve-field form.
    expect(
      await screen.findByText(/submission failed: please check pages/i)
    ).toBeInTheDocument();
  });

  it('does not upload the images a second time when a rejected form is fixed', async () => {
    setSession({ token: 'a-real-token' });
    postMock.mockReturnValueOnce({
      status: 400,
      body: { message: 'Validation failed', errors: [{ path: 'body.pages', message: 'Invalid input' }] },
    });
    renderPage();

    await fillAndSubmit();
    await screen.findByText(/submission failed/i);

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(2));

    // The bytes were already at Cloudinary. Sending them again would have left
    // the first copy orphaned there, and made the seller wait for it twice.
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('says which required fields are missing instead of posting', async () => {
    setSession({ token: 'a-real-token' });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/please fill: title, author, price/i)).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });
});
