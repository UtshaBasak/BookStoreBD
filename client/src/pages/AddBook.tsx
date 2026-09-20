import { useState, type ChangeEvent, type HTMLInputTypeAttribute } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import { API_BASE_URL } from '../config/api.js';
import { uploadImages } from '../utils/uploadImages.js';

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
}

const EMPTY_FORM: BookForm = {
  title: "", author: "", publisher: "", country: "", language: "",
  isbn: "", pages: "", price: "", desc: "", category: [], bookType: "new",
  condition: "mint", conditionDetails: ""
};

/** The text fields, which is everything except the category checkboxes. */
type TextField = Exclude<keyof BookForm, 'category'>;

const categoriesList = [
  "Fiction",
  "Non-Fiction",
  "Science & Technology",
  "Self-Help & Personal Development",
  "Romance",
  "Mystery & Thriller",
  "Fantasy & Sci-Fi",
  "History & Politics",
  "Children's & Young Adult",
  "Health, Wellness & Spirituality",
  "Graphic Novels & Comics",
  "Business & Finance",
  "Travel & Culture",
  "Others"
];

const AddBooks = () => {
  const navigate = useNavigate();
  const [Data, setData] = useState<BookForm>(EMPTY_FORM);
  const [images, setImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const headers = {
    id: localStorage.getItem('id'),
    authorization: `Bearer ${localStorage.getItem('token')}`,
  };

  const change = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({ ...Data, [name]: value });
    setFeedbackMessage('');
  };

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

    // Calculate total images after adding new selections
    const totalImages = [...images, ...selectedFiles];

    // Check if attempting to upload more than 10 images
    if (totalImages.length > 10) {
      setFeedbackMessage(`Maximum 10 images allowed. You already have ${images.length} images.`);
      setIsError(true);
      // Reset file input
      e.target.value = '';
      return;
    }

    // Add new images to existing ones
    setImages(prevImages => [...prevImages, ...selectedFiles]);
    setFeedbackMessage('');

    // Reset the file input to allow selecting the same file again
    e.target.value = '';
  };

  const submit = async () => {
    setLoading(true);
    setFeedbackMessage('');
    setIsError(false);

    // Only require: title, author, price, bookType, (condition if old), category, and at least one image
    const requiredFields: TextField[] = ['title', 'author', 'price', 'bookType'];
    if (Data.bookType === 'old') {
      requiredFields.push('condition');
    }
    // Check only required fields for emptiness (null, undefined, or empty string)
    const emptyFields = requiredFields.filter(
      field => Data[field] === undefined || Data[field] === null || Data[field].toString().trim() === ''
    );
    if (emptyFields.length > 0) {
      setFeedbackMessage(`Please fill: ${emptyFields.join(', ')}`);
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

    // Fill optional fields with 'N/A' if blank
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
    // Only append required fields and optional fields if they are non-empty
    (Object.keys(filledData) as Array<keyof BookForm>).forEach(key => {
      if (key === 'category') {
        if (filledData.category.length > 0) {
          filledData.category.forEach(cat => formData.append('category', cat));
        }
        return;
      }

      const value = filledData[key];
      if (requiredFields.includes(key)) {
        formData.append(key, value);
      } else if (value !== undefined && value !== null && value.trim() !== '') {
        // Only append optional fields if not empty
        formData.append(key, value);
      }
      // If optional field is empty, do not append at all
    });
    try {
      // When image hosting is configured the files go straight to Cloudinary
      // and only the resulting URLs are posted here; otherwise they are sent
      // to the API and stored inline, as before.
      const uploaded = await uploadImages(images, {
        onProgress: ({ completed, total }) =>
          setFeedbackMessage(`Uploading image ${completed} of ${total}...`),
      });

      if (uploaded.hosted) {
        uploaded.images.forEach((url) => formData.append('images', url));
        uploaded.publicIds.forEach((id) => formData.append('imagePublicIds', id));
      } else {
        images.forEach((img) => formData.append('images', img));
      }

      const res = await axios.post<{ message: string }>(
        `${API_BASE_URL}/user/add-book`,
        formData,
        { headers }
      );
      setFeedbackMessage(res.data.message);
      setIsError(false);
      setData(EMPTY_FORM);
      setImages([]);
      const imageInput = document.getElementById('imageInput');
      if (imageInput instanceof HTMLInputElement) imageInput.value = '';
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Unknown error";
      setFeedbackMessage(`Submission failed: ${msg}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 text-white p-4 md:p-8'>
      <div className='w-full'>
        <div className='flex justify-between items-center mb-10'>
          <button onClick={() => navigate('/profile')} className='px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm font-medium transition'>← Back</button>
          <h1 className='text-4xl font-bold text-blue-400'>📚Book Information📚</h1>
          <div className='w-[76px]'></div> {/* Empty div for balanced layout */}
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          <div className='bg-zinc-800 p-6 rounded-xl shadow-xl space-y-6'>
            <RadioGroup label="Book Type" name="bookType" value={Data.bookType} onChange={change} options={["new", "old"]} />

            {Data.bookType === 'old' && (
              <RadioGroup
                label="Condition"
                name="condition"
                value={Data.condition}
                onChange={change}
                options={["mint", "very good", "good", "fair", "poor"]}
              />
            )}

            <div>
              <label className='block text-sm text-zinc-400 mb-1'>Book Images (Max 10) *</label>
              <input
                type='file' id='imageInput' multiple onChange={handleImageChange}
                className='block w-full text-sm text-zinc-300 file:bg-blue-600 file:text-white file:px-4 file:py-2 file:rounded file:border-0 hover:file:bg-blue-700 transition cursor-pointer'
                accept="image/*"
              />
              {images.length > 0 && (
                <div className='mt-2 text-xs text-zinc-500'>
                  <div className="flex justify-between items-center">
                    <span>{images.length} image(s) selected</span>
                    <button
                      type="button"
                      onClick={() => setImages([])}
                      className="text-red-400 hover:text-red-500"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className='max-h-24 overflow-y-auto'>
                    {images.map((img, index) => (
                      <div key={index} className="flex justify-between items-center text-xs py-1 border-b border-zinc-700">
                        <span className="truncate">{img.name}</span>
                        <button
                          type="button"
                          onClick={() => setImages(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-400 hover:text-red-500 ml-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={submit} disabled={loading}
              className='w-full py-3 mt-4 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold transition-all duration-300'>
              {loading ? "Submitting..." : "Submit"}
            </button>

            {feedbackMessage && (
              <div className={`p-3 mt-3 rounded text-center text-sm ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{feedbackMessage}</div>
            )}
          </div>

          <div className='bg-zinc-800 p-6 rounded-xl shadow-xl space-y-4'>
            <InputField label="Title *" name="title" value={Data.title} onChange={change} />
            <InputField label="Author *" name="author" value={Data.author} onChange={change} />
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

          <div className='bg-zinc-800 p-6 rounded-xl shadow-xl space-y-4'>
            <InputField
              label="Price (Taka) *"
              name="price"
              value={Data.price}
              onChange={e => {
                const val = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                setData({ ...Data, price: val });
                setFeedbackMessage('');
              }}
              type="number"
              min="0.01"
              step="0.01"
            />
            <div>
              <label className='block text-sm text-zinc-400 mb-1'>Book Summary</label>
              <textarea
                name="desc" value={Data.desc} onChange={change} rows={5}
                placeholder="Short summary"
                className='w-full p-3 rounded bg-zinc-700 text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none'
              ></textarea>
            </div>

            {Data.bookType === 'old' && (
              <div>
                <label className='block text-sm text-zinc-400 mb-1'>Details About Book Condition</label>
                <textarea
                  name="conditionDetails" value={Data.conditionDetails} onChange={change} rows={4}
                  placeholder="Describe the book condition in detail"
                  className='w-full p-3 rounded bg-zinc-700 text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none'
                ></textarea>
              </div>
            )}

            <div>
              <label className='block text-sm text-zinc-400 mb-1'>Category <span style={{color:'red'}}>*</span></label>
              <div className='grid grid-cols-2 gap-2 max-h-52 overflow-y-auto p-2 border border-zinc-700 rounded'>
                {categoriesList.map(cat => (
                  <label key={cat} className='flex items-center gap-2 text-sm hover:bg-zinc-700 p-1 rounded'>
                    <input type='checkbox' value={cat} checked={Data.category.includes(cat)} onChange={handleCategoryChange} className='accent-blue-600'/>
                    {cat}
                  </label>
                ))}
              </div>
            </div>
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
}

// min and step were passed by the two numeric fields and silently dropped,
// because this component never forwarded them. They reach the input now.
const InputField = ({ label, name, value, onChange, placeholder = '', type = 'text', min, step }: InputFieldProps) => (
  <div>
    <label className='block text-sm text-zinc-400 mb-1'>{label}</label>
    <input
      type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
      min={min} step={step}
      className='w-full p-3 rounded bg-zinc-700 text-white outline-none focus:ring-2 focus:ring-blue-500'
    />
  </div>
);

interface RadioGroupProps {
  label: string;
  name: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  options: string[];
}

const RadioGroup = ({ label, name, value, onChange, options }: RadioGroupProps) => (
  <div>
    <label className='block text-sm text-zinc-400 mb-1'>{label}</label>
    <div className='flex flex-wrap gap-4'>
      {options.map(opt => (
        <label key={opt} className='flex items-center gap-2 cursor-pointer'>
          <input type="radio" name={name} value={opt} checked={value === opt} onChange={onChange} className='accent-blue-600'/>
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </label>
      ))}
    </div>
  </div>
);

export default AddBooks;
