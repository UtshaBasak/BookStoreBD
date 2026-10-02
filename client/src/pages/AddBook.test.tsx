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
import axios from 'axios';

import AddBooks from './AddBook.js';
import { uploadImages } from '../utils/uploadImages.js';
import { setSession } from '../utils/auth.js';

vi.mock('axios');

// The bytes go straight to Cloudinary from the browser; what is being tested
// is the request that follows, so this stands in for that round trip.
vi.mock('../utils/uploadImages.js', () => ({
  uploadImages: vi.fn().mockResolvedValue({
    hosted: true,
    images: ['https://res.cloudinary.com/demo/image/upload/v1/cover.png'],
    publicIds: ['bookstorebd/books/cover'],
  }),
}));

const postMock = vi.mocked(axios.post);
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
  postMock.mockResolvedValue({ data: { message: 'Book added successfully!' } });
  uploadMock.mockClear();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
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
  it('leaves the session to the shared request setup', async () => {
    setSession({ token: 'a-real-token' });
    renderPage();

    await fillAndSubmit();

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));

    const [url, body, options] = postMock.mock.calls[0];
    expect(String(url)).toMatch(/\/user\/add-book$/);
    // No header of its own - `Bearer null` is what its own copy used to send.
    // config/api.ts adds the token to every axios request (tested there).
    expect(options).toBeUndefined();

    const form = body as FormData;
    expect(form.get('title')).toBe('Pather Panchali');
    expect(form.get('images')).toBe('https://res.cloudinary.com/demo/image/upload/v1/cover.png');
  });


  it('repeats the field the API rejected, not just that it failed', async () => {
    setSession({ token: 'a-real-token' });
    postMock.mockRejectedValue({
      response: {
        data: {
          message: 'Validation failed',
          errors: [{ path: 'body.pages', message: 'Invalid input' }],
        },
      },
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
    postMock.mockRejectedValueOnce({
      response: {
        data: { message: 'Validation failed', errors: [{ path: 'body.pages', message: 'Invalid input' }] },
      },
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
