import { useRef, useState, type ChangeEvent, type HTMLInputTypeAttribute } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaCamera, FaCheck, FaExclamationTriangle, FaInfoCircle, FaTimes } from 'react-icons/fa';

import './Seller.css';
import FilePreview from '../components/FilePreview.js';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { site } from '../config/site.js';
import { CATEGORY_GROUPS } from '../config/categories.js';
import { useProfile } from '../hooks/queries.js';
import { ApiRequestError, apiErrorMessage } from '../utils/apiError.js';
import { getUserEmail } from '../utils/auth.js';
import { isOwnProfile } from '../utils/profile.js';
import { uploadImages, type UploadResult } from '../utils/uploadImages.js';

/**
 * The form as it is edited: every field a string, because that is what an
 * input holds. The API parses the numeric ones.
 */
interface BookForm {
  title: string;
  author: string;
  publisher: string;
  country: string;
  language: string;
  isbn: string;
  pages: string;
  price: string;
  desc: string;
  category: string[];
  bookType: string;
  condition: string;
  conditionDetails: string;
  /** Optional from the start: a percentage or taka off, or '' for none. */
  discountType: '' | 'percent' | 'amount';
  discountValue: string;
}

const EMPTY_FORM: BookForm = {
  title: "", author: "", publisher: "", country: "", language: "",
  isbn: "", pages: "", price: "", desc: "", category: [], bookType: "new",
  condition: "mint", conditionDetails: "", discountType: "", discountValue: ""
};

/** The text fields, which is everything except the category checkboxes. */
type TextField = Exclude<keyof BookForm, 'category' | 'discountType'>;

const AddBooks = () => {
  // From the Wanted board's "Have it? List it": the title and author filled in.
  const [searchParams] = useSearchParams();
  const [Data, setData] = useState<BookForm>(() => ({
    ...EMPTY_FORM,
    title: searchParams.get('title') ?? '',
    author: searchParams.get('author') ?? '',
    isbn: searchParams.get('isbn') ?? '',
  }));
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isError, setIsError] = useState(false);

  /**
   * What the last upload of these exact files produced.
   *
   * The images reach Cloudinary before the listing is posted, so a retry after
   * a rejected submission reuses them instead of uploading (and orphaning) a
   * second set.
   */
  const uploadedRef = useRef<{ files: File[]; result: UploadResult } | null>(null);

  // Known only once the profile has loaded; until then, and if it cannot be
  // read, the API is left to say so rather than blocking a seller who has one.
  const email = getUserEmail();
  const { data: profile } = useProfile(email, { enabled: Boolean(email) });
  const needsPayoutNumber = isOwnProfile(profile) && !profile.bkashMerchant;

  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({ ...Data, [name]: value });
    setFeedbackMessage('');
  };

  // What the discount would make the price, or null when it does not fit.
  const salePreview = (() => {
    const price = Number(Data.price);
    const value = Number(Data.discountValue);
    if (!Data.discountType || !(price > 0) || !Number.isInteger(value) || value < 1) return null;
    if (Data.discountType === 'percent') return value <= 90 ? Math.max(1, Math.round((price * (100 - value)) / 100)) : null;
    return value < price && value / price <= 0.9 ? price - value : null;
  })();

  const handleCategoryChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = e.target;
    if (value === 'Others' && checked) {
      setData(prev => ({ ...prev, category: ['Others'] }));
    } else if (value === 'Others' && !checked) {
      setData(prev => ({ ...prev, category: [] }));
    } else if (checked) {
      setData(prev => ({ ...prev, category: prev.category.filter(cat => cat !== 'Others').concat(value) }));
    } else {
      setData(prev => ({ ...prev, category: prev.category.filter(cat => cat !== value) }));
    }
    setFeedbackMessage('');
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files ?? []);

    const totalImages = [...images, ...selectedFiles];

    if (totalImages.length > 10) {
      setFeedbackMessage(`Maximum 10 images allowed. You already have ${images.length} images.`);
      setIsError(true);
      e.target.value = '';
      return;
    }

    setImages(prevImages => [...prevImages, ...selectedFiles]);
    setFeedbackMessage('');

    // Cleared so the same file can be selected again.
    e.target.value = '';
  };

  const submit = async () => {
    if (needsPayoutNumber) return;
    setLoading(true);
    setFeedbackMessage('');
    setIsError(false);

    // Required: title, author, price, book type (and condition if old), a category and an image.
    const requiredFields: TextField[] = ['title', 'author', 'price', 'bookType'];
    if (Data.bookType === 'old') {
      requiredFields.push('condition');
    }
    const emptyFields = requiredFields.filter(
      field => Data[field] === undefined || Data[field] === null || Data[field].toString().trim() === ''
    );
    if (emptyFields.length > 0) {
      setFeedbackMessage(`Please fill: ${emptyFields.join(', ')}`);
      setIsError(true);
      setLoading(false);
      return;
    }
    if (Data.discountType && salePreview === null) {
      setFeedbackMessage(
        Data.discountType === 'percent'
          ? 'A discount is between 1% and 90%.'
          : 'A discount is less than the price, and at most 90% of it.'
      );
      setIsError(true);
      setLoading(false);
      return;
    }
    if (!Array.isArray(Data.category) || Data.category.length === 0) {
      setFeedbackMessage("Please select at least one category.");
      setIsError(true);
      setLoading(false);
      return;
    }
    if (!Array.isArray(images) || images.length === 0) {
      setFeedbackMessage("Please select at least one image.");
      setIsError(true);
      setLoading(false);
      return;
    }
    if (images.length > 10) {
      setFeedbackMessage("Maximum 10 images allowed. Please select fewer images.");
      setIsError(true);
      setLoading(false);
      return;
    }

    // Blank optional fields are sent as 'N/A'.
    const optionalFields: TextField[] = ['publisher', 'country', 'language', 'isbn', 'desc', 'conditionDetails'];
    const filledData: BookForm = { ...Data };
    optionalFields.forEach(field => {
      if (
        filledData[field] === undefined ||
        filledData[field] === null ||
        filledData[field].toString().trim() === ''
      ) {
        filledData[field] = 'N/A';
      }
    });

    const formData = new FormData();
    // Required fields always; optional ones only when non-empty.
    (Object.keys(filledData) as Array<keyof BookForm>).forEach(key => {
      if (key === 'category') {
        if (filledData.category.length > 0) {
          filledData.category.forEach(cat => formData.append('category', cat));
        }
        return;
      }

      const value = filledData[key];
      if ((requiredFields as string[]).includes(key)) {
        formData.append(key, value);
      } else if (value !== undefined && value !== null && value.trim() !== '') {
        formData.append(key, value);
      }
    });
    try {
      // When image hosting is configured the files go straight to Cloudinary
      // and only the resulting URLs are posted here; otherwise they are sent
      // to the API and stored inline.
      const cached = uploadedRef.current;
      const reusable =
        cached !== null &&
        cached.files.length === images.length &&
        cached.files.every((file, index) => file === images[index]);

      const uploaded = reusable
        ? cached.result
        : await uploadImages(images, {
            onProgress: ({ completed, total }) =>
              setFeedbackMessage(`Uploading image ${completed} of ${total}...`),
          });

      uploadedRef.current = { files: [...images], result: uploaded };

      if (uploaded.hosted) {
        uploaded.images.forEach((url) => formData.append('images', url));
        uploaded.publicIds.forEach((id) => formData.append('imagePublicIds', id));
      } else {
        images.forEach((img) => formData.append('images', img));
      }

      // apiFetch adds the session, as for every other request.
      const res = await apiFetch(`${API_BASE_URL}/user/add-book`, { method: 'POST', body: formData });
      const data = (await res.json().catch(() => ({}))) as { message?: string; waiting?: number };
      if (!res.ok) throw new ApiRequestError(data.message || 'Request failed', res.status, data);
      const waiting = data.waiting ?? 0;
      const message = data.message ?? 'Book added.';
      setFeedbackMessage(
        waiting > 0
          ? `${message} ${waiting} ${waiting === 1 ? 'reader was' : 'readers were'} waiting for it on the Wanted board, and have just been told.`
          : message
      );
      setIsError(false);
      setData(EMPTY_FORM);
      setImages([]);
      uploadedRef.current = null;
      const imageInput = document.getElementById('imageInput');
      if (imageInput instanceof HTMLInputElement) imageInput.value = '';
    } catch (err) {
      // Shows the API's detail, which names the rejected field, not just its generic message.
      setFeedbackMessage(`Submission failed: ${apiErrorMessage(err, 'please try again')}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='sl-page'>
      <header className='sl-topbar'>
        <Link to='/' className='sl-logo-link' aria-label={`${site.name} home`}>
          <Logo size={34} />
        </Link>
        <div className='sl-topbar-actions'>
          <NotificationBell />
          <Link to="/profile?mode=seller" className='btn btn-ghost'>← Back</Link>
        </div>
      </header>

      <div className='sl-wrap'>
        <section className='sl-hero'>
          <span className='sl-kicker'>📚 Sell a book</span>
          <h1>Book Information</h1>
          <p className='sl-hero-sub'>
            Give the books you have finished a <span className='sl-hero-highlight'>second life</span>.
            Clear photos and a fair price sell fastest.
          </p>
        </section>

        {/*
          Shown before the form is filled in: the API refuses a listing from a
          seller it has no way to pay, so the seller learns this up front.
        */}
        {needsPayoutNumber && (
          <div role="alert" className='sl-alert'>
            <span className='sl-alert-icon' aria-hidden='true'><FaExclamationTriangle /></span>
            <div className='sl-alert-body'>
              <p>
                <strong>Before you list:</strong> add your bKash merchant number, so we can pay you
                when your book sells.
              </p>
              <Link to='/update-profile#bkash' className='btn btn-primary'>
                Add it now
              </Link>
            </div>
          </div>
        )}

        <div className='sl-form-grid'>
          <div>
            <section className='card sl-card'>
              <h2 className='sl-card-title'><span className='sl-step'>1</span>Photos</h2>
              <label htmlFor='imageInput' className='sl-label'>Book Images (Max 10) <span className='sl-required'>*</span></label>
              <div className='sl-drop'>
                <span className='sl-drop-icon' aria-hidden='true'><FaCamera /></span>
                <span className='sl-drop-title' aria-hidden='true'>Tap to add photos</span>
                <span className='sl-drop-sub' aria-hidden='true'>or drop them here · JPG, PNG, WebP or GIF · up to 10</span>
                <input
                  type='file' id='imageInput' multiple onChange={handleImageChange}
                  accept="image/png,image/jpeg,image/webp,image/gif"
                />
              </div>
              {images.length > 0 && (
                <>
                  <div className='sl-thumbs-head'>
                    <span>{images.length} image(s) selected</span>
                    <button
                      type="button"
                      onClick={() => setImages([])}
                      className="sl-link-danger"
                    >
                      Clear All
                    </button>
                  </div>
                  <ul className='sl-thumbs' style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {images.map((img, index) => (
                      <li key={index} className='sl-thumb'>
                        <FilePreview file={img} alt={`Preview of ${img.name}`} max={240} />
                        {index === 0 && <span className='badge sl-thumb-cover'>Cover</span>}
                        <span className='sl-thumb-name'>{img.name}</span>
                        <button
                          type="button"
                          onClick={() => setImages(prev => prev.filter((_, i) => i !== index))}
                          className="sl-thumb-remove"
                          aria-label={`Remove ${img.name}`}
                          title='Remove'
                        >
                          <FaTimes aria-hidden='true' />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className='card sl-card'>
              <h2 className='sl-card-title'><span className='sl-step'>2</span>About the book</h2>
              <div className='sl-fields'>
                <div className='sl-span'>
                  <InputField label="Title *" name="title" value={Data.title} onChange={change} placeholder='e.g. Pather Panchali' />
                </div>
                <div className='sl-span'>
                  <InputField label="Author *" name="author" value={Data.author} onChange={change} />
                </div>
                <InputField label="Publisher" name="publisher" value={Data.publisher} onChange={change} />
                <InputField label="Country" name="country" value={Data.country} onChange={change} />
                <InputField label="Language" name="language" value={Data.language} onChange={change} />
                <InputField label="ISBN" name="isbn" value={Data.isbn} onChange={change} />
                <InputField
                  label="No. of Pages"
                  name="pages"
                  value={Data.pages}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d]/g, '');
                    setData({ ...Data, pages: val });
                    setFeedbackMessage('');
                  }}
                  type="number"
                  min="1"
                  step="1"
                />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label htmlFor='book-desc' className='sl-label'>Book Summary</label>
                <textarea
                  id='book-desc'
                  name="desc" value={Data.desc} onChange={change} rows={5}
                  placeholder="Short summary"
                  className='field'
                  style={{ minHeight: 120, padding: '12px 14px', resize: 'vertical' }}
                ></textarea>
              </div>
            </section>
          </div>

          <div>
            <section className='card sl-card'>
              <h2 className='sl-card-title'><span className='sl-step'>3</span>Type &amp; condition</h2>
              <RadioGroup label="Book Type" name="bookType" value={Data.bookType} onChange={change} options={["new", "old"]} split />

              {Data.bookType === 'old' && (
                <div style={{ marginTop: '1rem' }}>
                  <RadioGroup
                    label="Condition"
                    name="condition"
                    value={Data.condition}
                    onChange={change}
                    options={["mint", "very good", "good", "fair", "poor"]}
                  />
                  <div style={{ marginTop: '1rem' }}>
                    <label htmlFor='book-conditionDetails' className='sl-label'>Details About Book Condition</label>
                    <textarea
                      id='book-conditionDetails'
                      name="conditionDetails" value={Data.conditionDetails} onChange={change} rows={4}
                      placeholder="Describe the book condition in detail"
                      className='field'
                      style={{ minHeight: 100, padding: '12px 14px', resize: 'vertical' }}
                    ></textarea>
                  </div>
                </div>
              )}
            </section>

            <section className='card sl-card'>
              <h2 className='sl-card-title'><span className='sl-step'>4</span>Price</h2>
              <InputField
                label="Price (Taka) *"
                name="price"
                value={Data.price}
                onChange={e => {
                  // Whole taka only, matching the API, so a decimal is caught while typing.
                  const val = e.target.value.replace(/\D/g, '');
                  setData({ ...Data, price: val });
                  setFeedbackMessage('');
                }}
                type="number"
                min="1"
                step="1"
                money
              />
              {/*
                Before they commit to a price, not after the first sale: what a
                seller keeps is part of choosing it.
              */}
              <p className='sl-fee-note'>
                <FaInfoCircle aria-hidden='true' />
                <span>
                  Listing is free. When it sells, {site.name} keeps {site.sellerFeePercent}%
                  {Number(Data.price) > 0 && (
                    <> - you receive <b>{(Number(Data.price) * (100 - site.sellerFeePercent) / 100).toFixed(2)} Tk</b> per copy</>
                  )}
                  .
                </span>
              </p>

              {/* An optional deal from the start. Changeable later, from the books list. */}
              <div className='sl-discount-new'>
                <label htmlFor='ab-discount-type' className='sl-label'>Discount (optional)</label>
                <div className='sl-discount-row'>
                  <select
                    id='ab-discount-type'
                    name='discountType'
                    className='field'
                    style={{ width: 'auto' }}
                    value={Data.discountType}
                    onChange={e => {
                      setData({ ...Data, discountType: e.target.value as BookForm['discountType'] });
                      setFeedbackMessage('');
                    }}
                  >
                    <option value=''>No discount</option>
                    <option value='percent'>% off</option>
                    <option value='amount'>৳ off</option>
                  </select>
                  {Data.discountType && (
                    <input
                      name='discountValue'
                      type='number'
                      min={1}
                      inputMode='numeric'
                      className='field'
                      style={{ width: 110 }}
                      aria-label={Data.discountType === 'percent' ? 'Percent off' : 'Taka off'}
                      placeholder={Data.discountType === 'percent' ? 'e.g. 15' : 'e.g. 50'}
                      value={Data.discountValue}
                      onChange={e => {
                        setData({ ...Data, discountValue: e.target.value.replace(/\D/g, '') });
                        setFeedbackMessage('');
                      }}
                    />
                  )}
                </div>
                {Data.discountType && salePreview !== null && (
                  <p className='sl-discount-hint'>Sells for ৳{salePreview} - it will show in Quick deals.</p>
                )}
              </div>
            </section>

            <section className='card sl-card'>
              <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <legend className='sl-card-title' style={{ padding: 0 }}>
                  <span className='sl-step'>5</span><span>Category <span className='sl-required'>*</span></span>
                </legend>
                <p className='sl-card-hint'>Pick all that fit - it helps buyers find it.</p>
                {CATEGORY_GROUPS.map(group => (
                  <div key={group.name} className='sl-choice-group'>
                    <p className='sl-choice-group-name'>
                      <span aria-hidden='true'>{group.emoji}</span> {group.name}
                    </p>
                    <div className='sl-choices'>
                      {group.items.map(cat => {
                        const on = Data.category.includes(cat);
                        return (
                          <label key={cat} className={`sl-choice${on ? ' is-on' : ''}`}>
                            <input name='category' type='checkbox' value={cat} checked={on} onChange={handleCategoryChange} />
                            {on && <FaCheck className='sl-choice-icon' aria-hidden='true' />}
                            {cat}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>
            </section>

            <section className='card sl-card sl-submit-card'>
              <button
                type='button'
                onClick={submit} disabled={loading || needsPayoutNumber}
                className='btn btn-accent'>
                {loading ? "Submitting..." : "Submit"}
              </button>
              <p className='sl-muted' style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', textAlign: 'center' }}>
                You can change the price and stock later, from your books.
              </p>

              {feedbackMessage && (
                <div aria-live='polite' className={`sl-feedback ${isError ? 'is-bad' : 'is-good'}`}>{feedbackMessage}</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

interface InputFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: HTMLInputTypeAttribute;
  min?: string;
  step?: string;
  /** Shows a taka sign inside the field. */
  money?: boolean;
}

const InputField = ({ label, name, value, onChange, placeholder = '', type = 'text', min, step, money = false }: InputFieldProps) => {
  const input = (
    <input
      id={`book-${name}`}
      type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
      min={min} step={step}
      className='field'
    />
  );
  return (
    <div>
      {/* Tied to the input by id: a floating label is not read out by a screen
          reader, and tapping it does not focus the field it sits above. */}
      <label htmlFor={`book-${name}`} className='sl-label'>{label}</label>
      {money ? (
        <div className='sl-money'>
          <span className='sl-money-sign' aria-hidden='true'>৳</span>
          {input}
        </div>
      ) : input}
    </div>
  );
};

interface RadioGroupProps {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  options: string[];
  /** Equal halves across the card, for a choice of two. */
  split?: boolean;
}

const RadioGroup = ({ label, name, value, onChange, options, split = false }: RadioGroupProps) => (
  <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
    <legend className='sl-label' style={{ padding: 0 }}>{label}</legend>
    <div className={`sl-choices${split ? ' sl-choices-split' : ''}`}>
      {options.map(opt => (
        <label key={opt} className={`sl-choice${value === opt ? ' is-on' : ''}`}>
          <input type="radio" name={name} value={opt} checked={value === opt} onChange={onChange} />
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </label>
      ))}
    </div>
  </fieldset>
);

export default AddBooks;
