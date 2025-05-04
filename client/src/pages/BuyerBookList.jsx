import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Utility to format date as dd/mm/yyyy
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default function BuyerBookList() {
  const [books, setBooks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const userEmail = localStorage.getItem('userEmail');
  const navigate = useNavigate();

  React.useEffect(() => {
    // Set body background to white to avoid black background on right side
    document.body.style.background = '#fff';
    return () => {
      document.body.style.background = '';
    };
  }, []);

  function groupOrdersByOrderNumber(orders) {
    const map = {};
    orders.forEach(order => {
      let key = order.orderNumber;
      if (!key || /@|T\d{2}:\d{2}/.test(key)) {
        key = order._id;
      }
      if (!map[key]) map[key] = [];
      map[key].push(order);
    });
    return map;
  }

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
      (order.sellerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.orderNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupOrdersByOrderNumber(filteredOrders);

  // Helper to get order-level info (shipping, discount, status) for a group
  function getOrderMeta(orderBooks) {
    const order = orderBooks[0];
    // Prefer DB fields if present, fallback to localStorage for legacy orders
    let shipping = typeof order.shippingCharge === 'number' ? order.shippingCharge : 0;
    let discount = typeof order.discount === 'number' ? order.discount : 0;
    let promo = order.promo || '';
    let promoApplied = !!order.promoApplied;
    let status = order.status;
    let orderNumber = order.orderNumber;

    // Fallback for legacy orders (before DB fields existed)
    if (shipping === 0 && discount === 0) {
      try {
        const confirmedOrderRaw = localStorage.getItem('confirmedOrder');
        if (confirmedOrderRaw) {
          const confirmedOrder = JSON.parse(confirmedOrderRaw);
          if (
            confirmedOrder &&
            confirmedOrder.orderNumber === orderNumber &&
            confirmedOrder.email === order.buyerEmail
          ) {
            shipping = Number(confirmedOrder.shippingCharge) || 0;
            discount = Number(confirmedOrder.discount) || 0;
            promo = confirmedOrder.promo || '';
            promoApplied = !!confirmedOrder.promoApplied;
          }
        }
      } catch (error) {
        console.error('Error parsing confirmed order:', error);
      }
    }
    return { shipping, discount, status, promo, promoApplied };
  }

  return (
    <div style={{
      width: '100vw',
      minWidth: '100vw',
      minHeight: '100vh',
      boxSizing: 'border-box',
      padding: '2rem',
      background: '#fff',
      margin: 0,
      overflowX: 'hidden'
    }}>
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
            marginLeft: 16,
            marginBottom: '1rem'
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <h2>Your Orders</h2>
      <input
        type="text"
        placeholder="Search by title, author, seller or order number..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: '0.5rem',
          marginBottom: '1rem',
          width: '100%',
          maxWidth: '400px',
          borderRadius: '4px',
          border: '1px solid #ccc'
        }}
      />
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