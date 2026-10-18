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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DescriptionForm from './Descriptionform.js';
import { uploadImages } from '../utils/uploadImages.js';
import { setSession } from '../utils/auth.js';

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

const stubFetch = (ok = true, refusal: Record<string, unknown> = { message: 'No' }) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        body: init?.body instanceof FormData ? init.body : null,
      });
      return Promise.resolve(
        new Response(JSON.stringify(ok ? { message: 'Return request submitted' } : refusal), {
          status: ok ? 200 : 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    })
  );
};

let queryClient: QueryClient;

const renderForm = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/description-form/line-1']}>
          <Routes>
            <Route path="/description-form/:orderId" element={<DescriptionForm />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

const fileFor = (name = 'damage.png') => new File(['bytes'], name, { type: 'image/png' });

beforeEach(() => {
  sent = [];
  navigate.mockClear();
  uploadMock.mockClear();
  uploadMock.mockResolvedValue({ hosted: false });
  setSession({ token: 'a-token' });
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

  it('refreshes the orders before going back, so the Return button is gone at once', async () => {
    stubFetch();
    renderForm();
    const refresh = vi.spyOn(queryClient, 'invalidateQueries');

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Pages loose');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/buyer-books'));
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['orders'] });
  });

  it('takes no more than the 2000 characters the shop keeps, and counts them', () => {
    stubFetch();
    renderForm();

    expect(screen.getByLabelText(/describe the problem/i)).toHaveAttribute('maxLength', '2000');
    expect(screen.getByText('0/2000')).toBeInTheDocument();
  });

  it("shows the field's own reason when the shop refuses it", async () => {
    stubFetch(false, { message: 'Validation failed', errors: [{ path: 'body.defectDescription', message: 'Too long' }] });
    renderForm();

    await userEvent.type(screen.getByLabelText(/bkash number/i), '01712345678');
    await userEvent.type(screen.getByLabelText(/describe the problem/i), 'Pages loose');
    await userEvent.upload(screen.getByLabelText(/photographs/i), fileFor());
    await userEvent.click(screen.getByRole('button', { name: /confirm return/i }));

    expect(await screen.findByText('Too long')).toBeInTheDocument();
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
