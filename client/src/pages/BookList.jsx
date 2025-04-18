import React, { useState, useEffect } from 'react';

export default function BookList() {
  const [books, setBooks] = useState([]);

  useEffect(() => {
    fetch('http://localhost:1015/book')
      .then((res) => res.json())
      .then((data) => setBooks(data))
      .catch((err) => console.error(err));
  }, []);

  const deleteBook = (id) => {
    fetch(`http://localhost:1015/book/${id}`, { method: 'DELETE' })
      .then(() => setBooks(books.filter((book) => book._id !== id)))
      .catch((err) => console.error('Error deleting book:', err));
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem' }}>
      <h2>Book List</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Publisher</th>
              <th>Country</th>
              <th>Language</th>
              <th>ISBN</th>
              <th>Pages</th>
              <th>Price (Tk)</th>
              <th>Category</th>
              <th>Book Type</th>
              <th>Condition</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book._id}>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{book.publisher}</td>
                <td>{book.country}</td>
                <td>{book.language}</td>
                <td>{book.isbn}</td>
                <td>{book.pages}</td>
                <td>{book.price}</td>
                <td>{book.category.join(', ')}</td>
                <td>{book.bookType}</td>
                <td>{book.condition}</td>
                <td>
                  <button onClick={() => deleteBook(book._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}