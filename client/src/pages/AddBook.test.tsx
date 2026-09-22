/**
 * Adding a book failed for everybody, and the page said only "Submission
 * failed".
 *
 * The session is stored under `authToken`. This page kept its own copy of the
 * header-building code, reading `token` - a key nothing has written since the
 * session moved into utils/auth - so every submission went out as
 * `Bearer null` and the API refused it. The upload to Cloudinary happened
 * first, so each attempt also left an orphaned image behind.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';

import AddBooks from './AddBook.js';
import { uploadImages } from '../utils/uploadImages.js';

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
  await user.click(screen.getByLabelText('Fiction'));
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
    <MemoryRouter>
      <AddBooks />
    </MemoryRouter>
  );

describe('submitting a listing', () => {
  it('sends the session the rest of the app stores', async () => {
    localStorage.setItem('authToken', 'a-real-token');
    renderPage();

    await fillAndSubmit();

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));

    const [url, body, options] = postMock.mock.calls[0];
    expect(String(url)).toMatch(/\/user\/add-book$/);
    // `Bearer null` is what this page used to send.
    expect((options as { headers: Record<string, string> }).headers).toMatchObject({
      Authorization: 'Bearer a-real-token',
    });

    const form = body as FormData;
    expect(form.get('title')).toBe('Pather Panchali');
    expect(form.get('images')).toBe('https://res.cloudinary.com/demo/image/upload/v1/cover.png');
  });

  it('sends no authorization at all when signed out, rather than a broken one', async () => {
    renderPage();

    await fillAndSubmit();

    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));

    const headers = (postMock.mock.calls[0][2] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it('repeats the field the API rejected, not just that it failed', async () => {
    localStorage.setItem('authToken', 'a-real-token');
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
    localStorage.setItem('authToken', 'a-real-token');
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
    localStorage.setItem('authToken', 'a-real-token');
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/please fill: title, author, price/i)).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });
});
