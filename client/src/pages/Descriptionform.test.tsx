/**
 * The return form had two forms and lost one of them.
 *
 * The photographs went to `/user/upload-images`, which handed back base64 and
 * stored nothing, and the description went to `/return` without them - so a
 * buyer was asked to photograph the damage and an administrator decided the
 * return with no evidence. The photograph form had no submit button at all, so
 * even that request never went.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

import DescriptionForm from './Descriptionform.js';
import { uploadImages } from '../utils/uploadImages.js';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../utils/uploadImages.js', () => ({
  uploadImages: vi.fn().mockResolvedValue({ hosted: false }),
}));

const uploadMock = vi.mocked(uploadImages);

/** Every request the form made, with its body. */
let sent: { url: string; body: FormData | null }[];

const stubFetch = (ok = true) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        body: init?.body instanceof FormData ? init.body : null,
      });
      return Promise.resolve(
        new Response(JSON.stringify({ message: ok ? 'Return request submitted' : 'No' }), {
          status: ok ? 200 : 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    })
  );
};

const renderForm = () =>
  render(
    <SnackbarProvider>
      <MemoryRouter initialEntries={['/description-form/line-1']}>
        <Routes>
          <Route path="/description-form/:orderId" element={<DescriptionForm />} />
        </Routes>
      </MemoryRouter>
    </SnackbarProvider>
  );

const fileFor = (name = 'damage.png') => new File(['bytes'], name, { type: 'image/png' });

beforeEach(() => {
  sent = [];
  navigate.mockClear();
  uploadMock.mockClear();
  uploadMock.mockResolvedValue({ hosted: false });
  localStorage.setItem('authToken', 'a-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('submitting a return', () => {
  it('sends the description and the photographs together', async () => {
    stubFetch();
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Pages loose');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(sent).toHaveLength(1));

    // One request, not two - and not one that threw the pictures away.
    const [request] = sent;
    expect(request.url).toMatch(/\/return$/);
    expect(request.body?.get('defectDescription')).toBe('Pages loose');
    expect(request.body?.getAll('images')).toHaveLength(1);
  });

  it('posts the hosted URLs when image hosting is configured', async () => {
    uploadMock.mockResolvedValue({
      hosted: true,
      images: ['https://res.cloudinary.com/demo/image/upload/v1/damage.png'],
      publicIds: ['bookstorebd/books/damage'],
    });
    stubFetch();
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Torn cover');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(sent).toHaveLength(1));

    expect(sent[0].body?.getAll('images')).toEqual([
      'https://res.cloudinary.com/demo/image/upload/v1/damage.png',
    ]);
    expect(sent[0].body?.getAll('imagePublicIds')).toEqual(['bookstorebd/books/damage']);
  });

  it('is not sent without a photograph: returns are decided on them', async () => {
    stubFetch();
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Two chapters missing');
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one photo/i);
    expect(sent).toHaveLength(0);
  });

  it('will not send an empty description, and says so', async () => {
    stubFetch();
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/describe what is wrong/i);
    expect(sent).toHaveLength(0);
  });

  it('goes back to the orders once it is in, where the row now says pending', async () => {
    stubFetch();
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Pages loose');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/buyer-books'));
  });

  it('stays put and says why when the API refuses it', async () => {
    stubFetch(false);
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Pages loose');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('names the order line and the refund number, written however it was typed', async () => {
    stubFetch();
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '+880 1712-345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Wrong edition');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    // The order line, not the book: the same title can be bought twice.
    expect(sent[0].body?.get('orderId')).toBe('line-1');
    expect(sent[0].body?.get('refundBkash')).toBe('01712345678');
  });

  it('catches a mistyped bKash number before uploading anything', async () => {
    stubFetch();
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '0171234');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Pages loose');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/11-digit bkash number/i);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
});
