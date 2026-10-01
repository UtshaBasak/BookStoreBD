import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FaCalendarCheck, FaMoneyBillWave, FaTruck, FaUndoAlt } from 'react-icons/fa';

import type { MessageResponse } from '@shared/api.js';

import Logo from '../components/Logo.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { site } from '../config/site.js';
import { useToast } from '../hooks/useToast.js';
import { reportError } from '../utils/report.js';
import { uploadImages } from '../utils/uploadImages.js';

const MAX_IMAGES = 10;

/**
 * The form of a bKash number the API accepts, after the same forgiveness:
 * spaces, dashes and the country code are allowed and dropped.
 */
const normaliseMobile = (value: string) => value.replace(/[\s-]/g, '').replace(/^\+?880/, '0');
const BD_MOBILE = /^01[3-9]\d{8}$/;

/** What the orders page passes along, when the form is reached from it. */
interface ReturnState {
  bookTitle?: string;
  /** Every title, when a whole order is being sent back. */
  bookTitles?: string[];
  returnableUntil?: string | null;
}

export default function DescriptionForm() {
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [bkash, setBkash] = useState('');
  // The order line, not the book: the same title can be bought twice.
  const { orderId } = useParams();
  // A whole order: every line in it that can still go back, in the address
  // so a reload keeps them. One description, one set of photographs and one
  // bKash number cover them all.
  const [params] = useSearchParams();
  const lineIds = [
    ...new Set([orderId ?? '', ...(params.get('lines') ?? '').split(',')].map((id) => id.trim()).filter(Boolean)),
  ];
  const { bookTitle, bookTitles, returnableUntil } = (useLocation().state ?? {}) as ReturnState;
  const titles = bookTitles?.length ? bookTitles : bookTitle ? [bookTitle] : [];
  const several = lineIds.length > 1;
  const navigate = useNavigate();
  const toast = useToast();

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setImages(Array.from(e.target.files ?? []));
  };

  /*
   * One form, one submit: the description, the refund number and the
   * photographs travel together to /return, so an administrator always
   * decides a return with the evidence in front of them.
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      toast.warning(several ? 'Please describe what is wrong with the books.' : 'Please describe what is wrong with the book.');
      return;
    }

    // Checked before anything is uploaded, so a typo does not cost the buyer
    // the photographs they have just sent.
    if (!BD_MOBILE.test(normaliseMobile(bkash))) {
      toast.warning('Please enter the 11-digit bKash number for your refund, like 01712345678.');
      return;
    }

    if (images.length === 0) {
      toast.warning('Please add at least one photo showing what is wrong - returns are decided on them.');
      return;
    }

    if (images.length > MAX_IMAGES) {
      toast.warning(`${MAX_IMAGES} images at most, please.`);
      return;
    }

    setSubmitting(true);

    try {
      // With hosting configured the files go straight to Cloudinary and only
      // the URLs are posted here; otherwise they are sent to the API.
      const uploaded = await uploadImages(images, {
        onProgress: ({ completed, total }) =>
          setProgress(`Uploading image ${completed} of ${total}...`),
      });

      const form = new FormData();
      lineIds.forEach((id) => form.append('orderId', id));
      form.append('defectDescription', description);
      form.append('refundBkash', normaliseMobile(bkash));

      if (uploaded.hosted) {
        uploaded.images.forEach((url) => form.append('images', url));
        uploaded.publicIds.forEach((id) => form.append('imagePublicIds', id));
      } else {
        images.forEach((image) => form.append('images', image));
      }

      setProgress('Sending the request...');
      const res = await apiFetch(`${API_BASE_URL}/return`, { method: 'POST', body: form });
      const data = (await res.json()) as MessageResponse;

      if (!res.ok) {
        toast.error(data.message || 'Could not send the return request.');
        return;
      }

      toast.success(data.message);
      // Back to the orders, where the row now shows the return as pending.
      navigate('/buyer-books');
    } catch (error) {
      reportError('Error returning book:', error);
      toast.error('Could not send the return request. Please try again.');
    } finally {
      setSubmitting(false);
      setProgress('');
    }
  };

  // The deep violet backdrop, with the form on a white card so what the buyer
  // types is plain to read.
  return (
    <div className="aurora min-h-screen w-full px-4 py-6 sm:py-10" style={{ boxSizing: 'border-box' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 620 }}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center" aria-label="BookStoreBD home" title="Go to Homepage">
            <Logo size={32} inverted />
          </Link>
          <Link
            to="/buyer-books"
            className="btn btn-ghost"
            style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
          >
            ← Your books
          </Link>
        </div>

        <div className="card p-5 sm:p-8">
          <div className="text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-xl"
              style={{ background: '#f3efff', color: '#6d28d9' }}
            >
              <FaUndoAlt />
            </div>
            <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.1rem)' }}>
              {several ? `Return ${lineIds.length} books` : 'Return a book'}
            </h1>
            {titles.length > 0 && (
              <p className="m-0 mt-2 flex flex-wrap justify-center gap-2">
                {titles.map((title, index) => (
                  <span
                    key={`${title}-${index}`}
                    className="inline-block rounded-full px-4 py-1 font-bold"
                    style={{ background: '#f3efff', color: '#5b21b6', overflowWrap: 'anywhere' }}
                  >
                    {title}
                  </span>
                ))}
              </p>
            )}
          </div>

          {/*
            What happens next, before they fill anything in: a buyer deciding
            whether to bother should know it costs them nothing to send back.
          */}
          {/* The app's base styles strip list markers; each line carries an
              icon instead. */}
          <ul
            className="mt-6 mb-6 grid gap-3 rounded-2xl p-4 text-sm leading-relaxed text-ink-soft"
            style={{ listStyle: 'none', background: '#faf9fe', border: '1px solid #ece8f7' }}
          >
            {returnableUntil && (
              <li className="flex gap-3">
                <FaCalendarCheck aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
                <span>You can ask until {new Date(returnableUntil).toLocaleDateString()}.</span>
              </li>
            )}
            <li className="flex gap-3">
              <FaTruck aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
              <span>If we approve it, we e-mail you our office address. Send the book by courier - we pay for that.</span>
            </li>
            <li className="flex gap-3">
              <FaMoneyBillWave aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
              <span>
                We refund the book's price to your bKash within {site.returns.refundWorkingDays} working days of it
                reaching us. The original delivery charge is not refunded.
              </span>
            </li>
          </ul>

          <form onSubmit={handleSubmit}>
            <h2 className="m-0 mb-4 text-xl">{several ? 'What is wrong with them?' : 'What is wrong with it?'}</h2>
            <label htmlFor="defect" className="mb-1.5 block text-sm font-semibold text-ink-soft">
              Describe the problem
            </label>
            <textarea
              id="defect"
              className="field mb-4"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={several ? 'Describe the issue with each book...' : 'Describe the issue with the book...'}
              rows={5}
              style={{ minHeight: 130, padding: '12px 14px', resize: 'vertical' }}
            />

            <label htmlFor="refund-bkash" className="mb-1.5 block text-sm font-semibold text-ink-soft">
              bKash number for your refund
            </label>
            <input
              id="refund-bkash"
              className="field mb-4"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={bkash}
              onChange={(e) => setBkash(e.target.value)}
              placeholder="01712345678"
            />

            <label htmlFor="defect-images" className="mb-1.5 block text-sm font-semibold text-ink-soft">
              Photographs of the damage (at least 1, up to {MAX_IMAGES})
            </label>
            {/* The browser's own file control, with its button made to match. */}
            <input
              id="defect-images"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={handleImageUpload}
              className="mb-4 block w-full cursor-pointer rounded-xl border border-dashed border-brand-line bg-brand-tint p-3 text-sm text-ink-soft file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-white file:px-4 file:font-bold file:text-brand"
            />
            {images.length > 0 && (
              <p className="mt-0 mb-4 text-sm font-semibold" style={{ color: '#047857' }}>
                {images.length} image{images.length === 1 ? '' : 's'} will be sent with this request.
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
              style={{ minHeight: 52, fontSize: 17, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? progress || 'Sending...' : 'Confirm Return'}
            </button>
            <p className="mt-4 mb-0 text-center text-sm">
              <Link to="/returns">Returns and refunds policy</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
