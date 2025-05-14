import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function BuyerOrderList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const userEmail = localStorage.getItem('userEmail');
  const navigate = useNavigate();

  // Group orders by orderNumber (if present), else fallback to _id
  function groupOrdersByOrderNumber(orders) {
    const map = {};
    orders.forEach(order => {
      let key = order.orderNumber;
      if (!key || /@|T\d{2}:\d{2}/.test(key)) key = order._id;
      if (!map[key]) map[key] = [];
      map[key].push(order);
    });
    return map;
  }

  const fetchOrders = () => {
    setRefreshing(true);
    axios.get(`http://localhost:1015/order/buyer?email=${encodeURIComponent(userEmail)}`)
      .then(res => {
        setOrders(Array.isArray(res.data) ? res.data : []);
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    if (!userEmail) return;
    fetchOrders();
    // eslint-disable-next-line
  }, [userEmail]);

  // Filter by search (title, author, seller, order number)
  const filteredOrders = orders.filter(
    order =>
      (order.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.author || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.sellerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.orderNumber || '').toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupOrdersByOrderNumber(filteredOrders);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#fff', overflowY: 'auto' }}>
      <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem', maxWidth: 1400, margin: '0 auto' }}>
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
        <h2>Your Orders (as Buyer)</h2>
        <input
          type="text"
          placeholder="Search by order number, title, author or seller..."
          value={search}
          onChange={e => setSearch(e.target.value)}
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
          {loading ? (
            <div>Loading...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div>No orders found.</div>
          ) : (
            Object.entries(grouped).map(([orderNumber, orderBooks]) => {
              const order = orderBooks[0];
              const shippingCost = order.shippingCharge || 0;
              const discount = order.discount || 0;
              const booksTotal = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
              const totalCost = booksTotal + Number(shippingCost) - Number(discount);
              const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
                ? order.orderNumber
                : orderNumber;
              return (
                <div key={orderNumber} style={{
                  marginBottom: 32,
                  background: '#fff',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  padding: 24,
                  position: 'relative'
                }}>
                  {/* Track Your Order button */}
                  <button
                    onClick={() => navigate(`/order-tracking/${order.orderNumber ? order.orderNumber : order._id}`)}
                    style={{
                      position: 'absolute',
                      top: 24,
                      right: 24,
                      backgroundColor: '#2196F3',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      padding: '0.5rem 1.5rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      zIndex: 2
                    }}
                  >
                    Track Your Order
                  </button>
                  <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 18 }}>
                    Order Placed On: {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''} <br />
                    Order Number: <span style={{ color: '#e65100' }}>{displayOrderNumber}</span>
                    <span style={{ marginLeft: 24, color: '#2196F3', fontWeight: 500 }}>
                      Status: {order.status || 'Order Confirmed'}
                    </span>
                  </div>
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
      <th>Total Cost</th>
    </tr>
  </thead>
                    
                    <tbody>
                      {orderBooks.map((ob, idx) => (
                        <tr key={ob._id || idx}>
                          <td>{ob.title}</td>
                          <td>{ob.author}</td>
                          <td>{Array.isArray(ob.category) ? ob.category.join(', ') : ob.category}</td>
                          <td>{ob.bookType}</td>
                          <td>{ob.condition}</td>
                          <td>{ob.pages}</td>
                          <td>{ob.price}</td>
                          <td>{ob.quantity}</td>
                          <td>{ob.sellerEmail}</td>
                          <td>{(Number(ob.price) * Number(ob.quantity)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Subtotal:</td>
                        <td style={{ fontWeight: 700 }}>{booksTotal.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Shipping Cost:</td>
                        <td style={{ fontWeight: 700 }}>{Number(shippingCost).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Discount:</td>
                        <td style={{ fontWeight: 700 }}>-{Number(discount).toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Order Total:</td>
                        <td style={{ fontWeight: 700 }}>{totalCost.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
