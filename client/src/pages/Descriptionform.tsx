import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FaCalendarCheck, FaMoneyBillWave, FaTruck, FaUndoAlt } from 'react-icons/fa';

import { useQueryClient } from '@tanstack/react-query';

import type { ApiError, MessageResponse } from '@shared/api.js';

import Logo from '../components/Logo.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { site } from '../config/site.js';
import { useToast } from '../hooks/useToast.js';
import { digits, formatDate, formatNumber, pick, t } from '../utils/language.js';
import { reportError } from '../utils/report.js';
import { uploadImages } from '../utils/uploadImages.js';

const MAX_IMAGES = 10;
/** What the server takes for the description. */
const MAX_DESCRIPTION = 2000;

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
  const queryClient = useQueryClient();

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
      toast.warning(
        several
          ? t('Please describe what is wrong with the books.', 'বইগুলোতে কী সমস্যা, তা লিখুন।')
          : t('Please describe what is wrong with the book.', 'বইটিতে কী সমস্যা, তা লিখুন।')
      );
      return;
    }

    // Checked before anything is uploaded, so a typo does not cost the buyer
    // the photographs they have just sent.
    if (!BD_MOBILE.test(normaliseMobile(bkash))) {
      toast.warning(
        t(
          'Please enter the 11-digit bKash number for your refund, like 01712345678.',
          'টাকা ফেরতের জন্য ১১ সংখ্যার বিকাশ নম্বর দিন, যেমন 01712345678।'
        )
      );
      return;
    }

    if (images.length === 0) {
      toast.warning(
        t(
          'Please add at least one photo showing what is wrong - returns are decided on them.',
          'সমস্যাটি দেখা যায় এমন অন্তত একটি ছবি দিন - ছবি দেখেই ফেরতের সিদ্ধান্ত নেওয়া হয়।'
        )
      );
      return;
    }

    if (images.length > MAX_IMAGES) {
      toast.warning(t(`${MAX_IMAGES} images at most, please.`, `সর্বোচ্চ ${formatNumber(MAX_IMAGES)}টি ছবি দিন।`));
      return;
    }

    setSubmitting(true);

    try {
      // With hosting configured the files go straight to Cloudinary and only
      // the URLs are posted here; otherwise they are sent to the API.
      const uploaded = await uploadImages(images, {
        onProgress: ({ completed, total }) =>
          setProgress(
            t(
              `Uploading image ${completed} of ${total}...`,
              `${formatNumber(total)}টির মধ্যে ${formatNumber(completed)}টি ছবি আপলোড হচ্ছে...`
            )
          ),
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

      setProgress(t('Sending the request...', 'অনুরোধ পাঠানো হচ্ছে...'));
      const res = await apiFetch(`${API_BASE_URL}/return`, { method: 'POST', body: form });
      const data = (await res.json()) as MessageResponse & ApiError;

      if (!res.ok) {
        // The field-level reason when there is one, not "Validation failed".
        toast.error(data.errors?.[0]?.message || data.message || t('Could not send the return request.', 'ফেরতের অনুরোধ পাঠানো যায়নি।'));
        return;
      }

      toast.success(data.message);
      // The orders are fetched again before the page shows them, so the
      // Return button is gone at once rather than after the cache runs out.
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      // Back to the orders, where the row now shows the return as pending.
      navigate('/buyer-books');
    } catch (error) {
      reportError('Error returning book:', error);
      toast.error(t('Could not send the return request. Please try again.', 'ফেরতের অনুরোধ পাঠানো যায়নি। আবার চেষ্টা করুন।'));
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
          <Link to="/" className="inline-flex items-center" aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}
            title={t('Go to Homepage', 'হোমপেজে যান')}
          >
            <Logo size={32} inverted />
          </Link>
          <Link
            to="/buyer-books"
            className="btn btn-ghost"
            style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.35)', color: '#fff' }}
          >
            {t('← Your books', '← আপনার বই')}
          </Link>
        </div>

        <div className="card p-5 sm:p-8">
          <div className="text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-xl"
              style={{ background: 'var(--color-brand-tint)', color: 'var(--color-brand)' }}
            >
              <FaUndoAlt />
            </div>
            <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.1rem)' }}>
              {several
                ? t(`Return ${lineIds.length} books`, `${formatNumber(lineIds.length)}টি বই ফেরত দিন`)
                : t('Return a book', 'একটি বই ফেরত দিন')}
            </h1>
            {titles.length > 0 && (
              <p className="m-0 mt-2 flex flex-wrap justify-center gap-2">
                {titles.map((title, index) => (
                  <span
                    key={`${title}-${index}`}
                    className="inline-block rounded-full px-4 py-1 font-bold"
                    style={{ background: 'var(--color-brand-tint)', color: 'var(--color-brand-dark)', overflowWrap: 'anywhere' }}
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
            style={{ listStyle: 'none', background: 'var(--color-surface-alt)', border: '1px solid var(--color-line)' }}
          >
            {returnableUntil && (
              <li className="flex gap-3">
                <FaCalendarCheck aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
                <span>
                  {pick(
                    <>You can ask until {formatDate(returnableUntil)}.</>,
                    <>{formatDate(returnableUntil)} পর্যন্ত অনুরোধ করতে পারবেন।</>
                  )}
                </span>
              </li>
            )}
            <li className="flex gap-3">
              <FaTruck aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
              <span>
                {t(
                  'If we approve it, we e-mail you our office address. Send the book by courier - we pay for that.',
                  'অনুমোদন করলে আমরা আপনাকে আমাদের অফিসের ঠিকানা ই-মেইল করব। কুরিয়ারে বইটি পাঠান - খরচ আমরা দেব।'
                )}
              </span>
            </li>
            <li className="flex gap-3">
              <FaMoneyBillWave aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
              <span>
                {pick(
                  <>
                    We refund the book's price to your bKash within {site.returns.refundWorkingDays} working days of it
                    reaching us. The original delivery charge is not refunded.
                  </>,
                  <>
                    বইটি আমাদের কাছে পৌঁছানোর {formatNumber(site.returns.refundWorkingDays)} কর্মদিবসের মধ্যে বইয়ের দাম
                    আপনার বিকাশে ফেরত পাঠানো হবে। আগের ডেলিভারি চার্জ ফেরত দেওয়া হয় না।
                  </>
                )}
              </span>
            </li>
          </ul>

          <form onSubmit={handleSubmit}>
            <h2 className="m-0 mb-4 text-xl">{several
                ? t('What is wrong with them?', 'বইগুলোতে কী সমস্যা?')
                : t('What is wrong with it?', 'বইটিতে কী সমস্যা?')}</h2>
            <label htmlFor="defect" className="mb-1.5 block text-sm font-semibold text-ink-soft">
              {t('Describe the problem', 'সমস্যাটি লিখুন')}
            </label>
            <textarea
              id="defect"
              className="field mb-4"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                several
                  ? t('Describe the issue with each book...', 'প্রতিটি বইয়ের সমস্যা লিখুন...')
                  : t('Describe the issue with the book...', 'বইটির সমস্যা লিখুন...')
              }
              rows={5}
              maxLength={MAX_DESCRIPTION}
              aria-describedby="defect-count"
              style={{ minHeight: 130, padding: '12px 14px', resize: 'vertical' }}
            />
            <p id="defect-count" className="-mt-3 mb-4 text-right text-xs text-ink-muted">
              {digits(description.length)}/{digits(MAX_DESCRIPTION)}
            </p>

            <label htmlFor="refund-bkash" className="mb-1.5 block text-sm font-semibold text-ink-soft">
              {t('bKash number for your refund', 'টাকা ফেরতের জন্য বিকাশ নম্বর')}
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
              {pick(
                <>Photographs of the damage (at least 1, up to {MAX_IMAGES})</>,
                <>সমস্যার ছবি (অন্তত ১টি, সর্বোচ্চ {formatNumber(MAX_IMAGES)}টি)</>
              )}
            </label>
            {/* The browser's own file control, with its button made to match. */}
            <input
              id="defect-images"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={handleImageUpload}
              className="mb-4 block w-full cursor-pointer rounded-xl border border-dashed border-brand-line bg-brand-tint p-3 text-sm text-ink-soft file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface file:px-4 file:font-bold file:text-brand"
            />
            {images.length > 0 && (
              <p className="mt-0 mb-4 text-sm font-semibold" style={{ color: 'var(--color-success-dark)' }}>
                {pick(
                  <>
                    {images.length} image{images.length === 1 ? '' : 's'} will be sent with this request.
                  </>,
                  <>এই অনুরোধের সঙ্গে {formatNumber(images.length)}টি ছবি পাঠানো হবে।</>
                )}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={submitting}
              style={{ minHeight: 52, fontSize: 17, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? progress || t('Sending...', 'পাঠানো হচ্ছে...') : t('Confirm Return', 'ফেরত নিশ্চিত করুন')}
            </button>
            <p className="mt-4 mb-0 text-center text-sm">
              <Link to="/returns">{t('Returns and refunds policy', 'ফেরত ও রিফান্ড নীতি')}</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
