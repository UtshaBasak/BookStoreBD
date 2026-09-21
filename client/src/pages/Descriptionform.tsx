import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';

import type { Book, MessageResponse } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';

export default function DescriptionForm() {
  const [description, setDescription] = useState('');
  const [_books, setBooks] = useState<Book[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const userEmail = getUserEmail();
  const { bookId } = useParams();
  const toast = useToast();

  const handleDescriptionSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const res = await apiFetch(`${API_BASE_URL}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookId, userEmail, defectDescription: description }),
      });

      const data = (await res.json()) as MessageResponse;
      if (res.ok) {
        toast.success(data.message);
        setBooks((prevBooks) => prevBooks.filter((book) => book._id !== bookId));
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error('Error returning book:', error);
      toast.error('Could not send the return request. Please try again.');
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    setImages(Array.from(e.target.files ?? []));
  };

  const handleImageSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (images.length === 0) {
      toast.warning('Please choose at least one image.');
      return;
    }

    if (images.length > 10) {
      toast.warning('Ten images at most, please.');
      return;
    }

    const formData = new FormData();
    images.forEach((image) => formData.append('images', image));
    formData.append('bookId', bookId ?? '');
    formData.append('userEmail', userEmail ?? '');

    try {
      const res = await apiFetch(`${API_BASE_URL}/user/upload-images`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Images uploaded.');
        setImages([]); // Clear images after successful upload
      } else {
        toast.error(data.message || 'Could not upload the images.');
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error('Could not upload the images. Please try again.');
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
        <h1 style={{ textAlign: 'center', color: 'white' }}>Report Defective Book</h1>

        {/* Form for uploading images */}
        <form onSubmit={handleImageSubmit} style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: 'white' }}>Upload Images</h2>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ marginBottom: '1rem', width: '100%' }}
          />
          {/* <button
            type="submit"
            style={{
              backgroundColor: '#2196F3',
              color: 'white',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Images Upload
          </button> */}
        </form>

        {/* Form for writing a description */}
        <form onSubmit={handleDescriptionSubmit}>
          <h2 style={{ color: 'white' }}>Write a Description</h2>
          <textarea
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
              color: 'black', // Ensures text inside the textarea is readable
            }}
          />
          <button
            type="submit"
            style={{
              backgroundColor: '#43a047',
              color: 'white',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Confirm Return
          </button>
        </form>
      </div>
    </div>
  );
}
