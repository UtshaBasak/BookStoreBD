import React, { useState } from 'react';
import { useParams } from 'react-router-dom';

export default function DescriptionForm() {
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const userEmail = localStorage.getItem('userEmail');
  const { bookId } = useParams();

  console.log('Book ID:', bookId);

  const handleDescriptionSubmit = async (e) => {

    e.preventDefault();
    
        try {
          const res = await fetch('http://localhost:1015/return', {
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

  const handleImageSubmit = (e) => {
    e.preventDefault();
    console.log('Images upload:', images);
    
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>Report Defective Book</h1>

      {/* Form for uploading images */}
      <form onSubmit={handleImageSubmit} style={{ marginBottom: '2rem' }}>
        <h2>Upload Images</h2>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          style={{ marginBottom: '1rem' }}
        />
        <button
          type="submit"
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
         Images Upload
        </button>
      </form>

      {/* Form for writing a description */}
      <form onSubmit={handleDescriptionSubmit}>
        <h2>Write a Description</h2>
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
          }}
        >
          Confirm Return
        </button>
      </form>
    </div>
  );
}