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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const buyerEmail = localStorage.getItem('userEmail');
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
    fetch(`http://localhost:1015/order/buyer?email=${encodeURIComponent(buyerEmail)}`)
      .then(res => res.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line
  }, [buyerEmail]);

  const filteredOrders = orders.filter(
    order =>
      (order.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.author || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.sellerEmail || '').toLowerCase().includes(search.toLowerCase())
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
        placeholder="Search by title, author, or seller..."
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
        {loading ? (
          <div>Loading...</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div>No orders found.</div>
        ) : (
          Object.entries(grouped).map(([orderNumber, orderBooks]) => {
            const order = orderBooks[0];
            const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
              ? order.orderNumber
              : orderNumber;
            const itemTotal = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
            const { shipping, discount, status, promo, promoApplied } = getOrderMeta(orderBooks);
            const finalTotal = itemTotal + shipping - discount;

            return (
              <div key={orderNumber} style={{
                marginBottom: 32,
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: 24
              }}>
                <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 18 }}>
                  Order Placed On: {formatDate(order.createdAt)} <br />
                  Order Number: <span style={{ color: '#e65100' }}>{displayOrderNumber}</span>
                  <span style={{ marginLeft: 24, color: '#2196F3', fontWeight: 500 }}>
                    Status: {status}
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
                      <td style={{ fontWeight: 700 }}>{itemTotal.toFixed(2)}</td>
                    </tr>
                    {/* Always show shipping row, even if 0 */}
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>Shipping Charge:</td>
                      <td style={{ fontWeight: 700 }}>{shipping.toFixed(2)}</td>
                    </tr>
                    {discount > 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600 }}>
                          Discount{promoApplied && promo ? ` (${promo})` : ''}:
                        </td>
                        <td style={{ fontWeight: 700 }}>- {discount.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>Order Total:</td>
                      <td style={{ fontWeight: 900, fontSize: 16 }}>{finalTotal.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
