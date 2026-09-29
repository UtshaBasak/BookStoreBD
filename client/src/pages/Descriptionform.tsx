import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import type { MessageResponse } from '@shared/api.js';

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
  const { bookTitle, returnableUntil } = (useLocation().state ?? {}) as ReturnState;
  const navigate = useNavigate();
  const toast = useToast();

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setImages(Array.from(e.target.files ?? []));
  };

  /*
   * One form, one submit.
   *
   * There were two: the photographs went to /user/upload-images, which handed
   * back base64 and stored nothing, and the description went to /return
   * without them. The photograph form had no submit button at all, so even
   * that never ran - a buyer chose the pictures of the damage and they went
   * nowhere, and an administrator decided the return with no evidence.
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      toast.warning('Please describe what is wrong with the book.');
      return;
    }

    // Checked before anything is uploaded, so a typo does not cost the buyer
    // the photographs they have just sent.
    if (!BD_MOBILE.test(normaliseMobile(bkash))) {
      toast.warning('Please enter the 11-digit bKash number for your refund, like 01712345678.');
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
      form.append('orderId', orderId ?? '');
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

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem',
        fontFamily: 'Arial, sans-serif',
        backgroundImage: `url('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1400&q=80')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        height: '100%',
        width: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        color: 'white', // Ensures all text inherits white color
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          padding: '2rem',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '600px',
        }}
      >
        <h1 style={{ textAlign: 'center', color: 'white' }}>Return a book</h1>
        {bookTitle && (
          <p style={{ textAlign: 'center', marginTop: 0, fontSize: 18 }}>{bookTitle}</p>
        )}

        {/*
          What happens next, before they fill anything in: a buyer deciding
          whether to bother should know it costs them nothing to send back.
        */}
        {/* The app's base styles strip list markers, so they are asked for back. */}
        <ul
          style={{
            margin: '0 0 1.5rem',
            paddingLeft: '1.25rem',
            lineHeight: 1.5,
            fontSize: 15,
            listStyle: 'disc',
            display: 'grid',
            gap: '0.5rem',
          }}
        >
          {returnableUntil && (
            <li>You can ask until {new Date(returnableUntil).toLocaleDateString()}.</li>
          )}
          <li>If we approve it, we e-mail you our office address. Send the book by courier - we pay for that.</li>
          <li>
            We refund the book's price to your bKash within {site.returns.refundWorkingDays} working days of it
            reaching us. The original delivery charge is not refunded.
          </li>
        </ul>

        <form onSubmit={handleSubmit}>
          <h2 style={{ color: 'white' }}>What is wrong with it?</h2>
          <label htmlFor="defect" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Describe the problem
          </label>
          <textarea
            id="defect"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue with the book..."
            rows={5}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginBottom: '1rem',
              // Black text needs a light box behind it: the field was
              // transparent, so what the buyer typed sat on the dark photograph.
              color: 'black',
              backgroundColor: 'white',
              fontSize: 16,
            }}
          />

          <label htmlFor="refund-bkash" style={{ display: 'block', marginBottom: '0.5rem' }}>
            bKash number for your refund
          </label>
          <input
            id="refund-bkash"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={bkash}
            onChange={(e) => setBkash(e.target.value)}
            placeholder="01712345678"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: '4px',
              border: '1px solid #ccc',
              marginBottom: '1rem',
              color: 'black',
              backgroundColor: 'white',
              fontSize: 16,
            }}
          />

          <label htmlFor="defect-images" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Photographs of the damage (up to {MAX_IMAGES}, optional)
          </label>
          <input
            id="defect-images"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            onChange={handleImageUpload}
            style={{ marginBottom: '1rem', width: '100%' }}
          />
          {images.length > 0 && (
            <p style={{ marginTop: 0, marginBottom: '1rem', fontSize: 14 }}>
              {images.length} image{images.length === 1 ? '' : 's'} will be sent with this request.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              backgroundColor: '#43a047',
              color: 'white',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              width: '100%',
              minHeight: 44,
            }}
          >
            {submitting ? progress || 'Sending...' : 'Confirm Return'}
          </button>
          <p style={{ marginBottom: 0, fontSize: 14, textAlign: 'center' }}>
            <Link to="/returns" style={{ color: 'white' }}>Returns and refunds policy</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
