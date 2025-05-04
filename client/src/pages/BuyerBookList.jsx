import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function BuyerBookList() {
  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const userEmail = localStorage.getItem('userEmail');
  const navigate = useNavigate();

  const fetchOrders = () => {
    setRefreshing(true);
    fetch(`http://localhost:1015/order/buyer?email=${encodeURIComponent(userEmail)}`)
      .then(res => res.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const res = await fetch(`http://localhost:1015/api/purchases?email=${userEmail}`);
        const data = await res.json();
        setBooks(data);
      } catch (error) {
        console.error('Error fetching purchased books:', error);
      }
    };

    fetchBooks();
    fetchOrders();
  }, [userEmail]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this order record?')) return;
    await fetch(`http://localhost:1015/order/${id}`, { method: 'DELETE' });
    setOrders(orders => orders.filter(o => o._id !== id));
  };

  const handleReturn =  (bookId) => {
    navigate(`/description-form/${bookId}`);
  };
  
  const filteredOrders = orders.filter(
    order =>
      (order.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.author || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.sellerEmail || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => navigate('/profile')}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          ← Return to Profile
        </button>
        <input
          type="text"
          placeholder="Search by title, author, or seller"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc', marginLeft: 16 }}
        />
        <button
          onClick={fetchOrders}
          disabled={refreshing}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            marginLeft: 16
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <h2>Your Purchased Books</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Category</th>
              <th>Book Type</th>
              <th>Condition</th>
              <th>No. of Pages</th>
              <th>Price (Tk.)</th>
              <th>Quantity</th>
              <th>Seller</th>
              <th>Created at</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11}>Loading...</td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={11}>No books purchased yet.</td></tr>
            ) : (
              filteredOrders.map((order, idx) => (
                <tr key={order._id || idx}>
                  <td>{order.title}</td>
                  <td>{order.author}</td>
                  <td>{Array.isArray(order.category) ? order.category.join(', ') : order.category}</td>
                  <td>{order.bookType}</td>
                  <td>{order.condition}</td>
                  <td>{order.pages}</td>
                  <td>{order.price}</td>
                  <td>{order.quantity}</td>
                  <td>{order.sellerEmail}</td>
                  <td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</td>
                  <td>
                    
                    {!order.isReturned && (
                    <button
                      onClick={() => handleReturn(order.bookId)}
                      style={{
                        backgroundColor: '#f39c12',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '5px 10px',
                        cursor: 'pointer',
                        marginLeft: '5px'
                      }}
                    >
                      Return
                    </button>
                  )}

                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
