import React, { useState, useEffect } from 'react';

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

export default function TransactionHistory() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Fetch all orders for admin
  const fetchOrders = () => {
    setRefreshing(true);
    fetch('http://localhost:1015/order/admin/all')
      .then((res) => res.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

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

  // Filtered orders by search (order number, buyer, seller, title, author)
  const filteredOrders = orders.filter(order =>
    (order.orderNumber || '').toLowerCase().includes(search.toLowerCase()) ||
    (order.buyerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
    (order.sellerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
    (order.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (order.author || '').toLowerCase().includes(search.toLowerCase())
  );

  const grouped = groupOrdersByOrderNumber(filteredOrders);

  return (
    <div style={{ padding: '2rem', background: '#fff', minHeight: '100vh', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>Transaction History</h1>
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
            minWidth: 120
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {/* Search bar */}
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Search by order number, buyer, seller, title, or author..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: 4,
            border: '1px solid #ccc',
            width: '100%',
            maxWidth: 500,
            fontSize: 16,
            boxSizing: 'border-box'
          }}
        />
      </div>
      {/* Individual Order Cards */}
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto' }}>
        {Object.keys(grouped).length === 0 ? (
          <div>No transactions found.</div>
        ) : (
          Object.entries(grouped).map(([orderNumber, orderBooks]) => {
            const order = orderBooks[0];
            const displayOrderNumber = order.orderNumber && !/@|T\d{2}:\d{2}/.test(order.orderNumber)
              ? order.orderNumber
              : orderNumber;
            const itemTotal = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
            const shipping = typeof order.shippingCharge === 'number' ? order.shippingCharge : 0;
            const discount = typeof order.discount === 'number' ? order.discount : 0;
            const promo = order.promo || '';
            const promoApplied = !!order.promoApplied;
            const finalTotal = itemTotal + shipping - discount;
            const status = order.status;

            return (
              <div key={orderNumber} style={{
              marginBottom: 40,
              background: '#fff',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              padding: 24,
              border: '1px solid #e0e0e0'
              }}>
              <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 18 }}>
                Order Placed On: {formatDate(order.createdAt)} <br />
                <span>
                Order Number: <span style={{ color: '#e65100', fontWeight: 700 }}>{displayOrderNumber}</span>
                </span>
                <span style={{ marginLeft: 24, color: '#2196F3', fontWeight: 500 }}>
                Status: {status}
                </span>
                <br />
                <span style={{ color: '#888', fontWeight: 700 }}>
                Buyer Email: {order.buyerEmail}
                </span>
              </div>
              <table className="styled-table" style={{ width: '100%', marginBottom: 0 }}>
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

