import React, { useState, useEffect } from 'react';

export default function BookList() {
  const [books, setBooks] = useState([]);
  const [users, setUsers] = useState({}); // Map: email -> user name

  useEffect(() => {
    fetch('http://localhost:1015/book')
      .then((res) => res.json())
      .then((data) => setBooks(data))
      .catch((err) => console.error(err));
    // Fetch all users to map email to name
    fetch('http://localhost:1015/user')
      .then(res => res.json())
      .then(data => {
        // Build a map: email -> name
        const map = {};
        (Array.isArray(data) ? data : []).forEach(u => {
          map[u.email] = u.name || u.email;
        });
        setUsers(map);
      })
      .catch(() => {});
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
              <th>Pages</th>
              <th>Price (Tk)</th>
              <th>Category</th>
              <th>Book Type</th>
              <th>Condition</th>
              <th>Stock</th>
              <th>Owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book._id}>
                <td>{book.title}</td>
                <td>{book.author}</td>
                <td>{book.pages}</td>
                <td>{book.price}</td>
                <td>{Array.isArray(book.category) ? book.category.join(', ') : book.category}</td>
                <td>{book.bookType}</td>
                <td>{book.condition}</td>
                <td>{book.stock}</td>
                <td>{users[book.sellerEmail] || book.sellerEmail}</td>
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