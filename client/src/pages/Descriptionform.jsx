import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

export default function DescriptionForm() {
  const [description, setDescription] = useState('');
  const [_books, setBooks] = useState([]);
  const [images, setImages] = useState([]);
  const userEmail = localStorage.getItem('userEmail');
  const { bookId } = useParams();

  console.log('Book ID:', bookId);

  const handleDescriptionSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch('http://localhost:4000/return', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookId, userEmail, defectDescription: description }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        setBooks((prevBooks) => prevBooks.filter((book) => book._id !== bookId));
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error returning book:', error);
      alert('Failed to return the book. Please try again.');
    }
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    setImages(files);
  };

  const handleImageSubmit = async (e) => {
    e.preventDefault();

    if (images.length === 0) {
      alert('Please select at least one image to upload.');
      return;
    }

    if (images.length > 10) {
      alert('You can upload a maximum of 10 images.');
      return;
    }

    const formData = new FormData();
    images.forEach((image) => formData.append('images', image));
    formData.append('bookId', bookId);
    formData.append('userEmail', userEmail);

    try {
      const res = await fetch('http://localhost:4000/upload-images', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        alert('Images uploaded successfully!');
        setImages([]); // Clear images after successful upload
      } else {
        alert(data.message || 'Failed to upload images.');
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      alert('Failed to upload images. Please try again.');
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
            rows="5"
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