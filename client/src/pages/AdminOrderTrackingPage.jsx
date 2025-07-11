import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/orderTracking.css';

const ORDER_STAGES = [
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered'
];

export default function AdminOrderTrackingPage() {
  const ADMIN_EMAIL = 'utsha23basak@gmail.com';
  const userEmail = localStorage.getItem('userEmail');
  const navigate = useNavigate();
  const { orderNumber } = useParams();
  // Restrict access to admin only
  useEffect(() => {
    if (userEmail !== ADMIN_EMAIL) {
      navigate('/sign-in', { replace: true });
    }
  }, [userEmail, navigate]);
  const [_error, setError] = useState('');

  const [statusValue, setStatusValue] = useState('');
  useEffect(() => {
    if (!orderNumber) return;
    axios.get(`http://localhost:4000/order/${orderNumber}`)
      .then(res => {
        setOrder(res.data);
        setStatusValue(res.data.status || 'Order Confirmed');
      })
      .catch(() => setOrder(null));
  }, [orderNumber]);
  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    setStatusValue(newStatus);
    setError('');
    try {
      await axios.patch(`http://localhost:4000/order/status/${orderNumber}`, { status: newStatus });
      // Refetch all books for this order after successful update
      const res = await axios.get(`http://localhost:4000/order/${orderNumber}`);
      setOrder(res.data);
      setStatusValue(res.data.status);
      setError('');
    } catch (error) {
      setError('Failed to update status: ' + error.message);
    }
  };

  const [order, setOrder] = useState(null);

  if (!order) return <div>Loading...</div>;

  const books = order.books || [];
  const itemTotal = books.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
  const shipping = typeof order.shippingCost === 'number' ? order.shippingCost : 0;
  const discount = typeof order.discount === 'number' ? order.discount : 0;
  const finalTotal = itemTotal + shipping - discount;

  return (
    <div className="order-tracking-outer">
      <div style={{ position: 'absolute', top: 24, right: 32, display: 'flex', gap: 16, zIndex: 10 }}>
        <button
          onClick={() => navigate('/admin/users')}
          style={{
            background: '#fff',
            border: '2px solid #2196F3',
            color: '#2196F3',
            fontWeight: 700,
            fontSize: 16,
            borderRadius: 8,
            padding: '8px 20px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(33,150,243,0.08)',
            transition: 'all 0.18s',
            outline: 'none',
            marginRight: 0
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#2196F3'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#2196F3'; }}
        >
          ← Back to Admin Panel
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#2196F3',
            border: '2px solid #2196F3',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            borderRadius: 8,
            padding: '8px 20px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(33,150,243,0.08)',
            transition: 'all 0.18s',
            outline: 'none'
          }}
          onMouseOver={e => { e.currentTarget.style.background = '#1769aa'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#2196F3'; }}
        >
          ⟳ Refresh
        </button>
      </div>
      <div className="order-tracking-card">
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#e65100', letterSpacing: 1 }}>Track The Order (Admin)</h2>
        <div className="order-info" style={{ fontSize: 17, marginBottom: 24, textAlign: 'left', paddingLeft: 8 }}>
          <p><b>Order Number:</b> <span style={{ color: '#e65100', fontFamily: 'monospace', fontSize: 18 }}>{order.orderNumber}</span></p>
          <p><b>Placed On:</b> {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</p>
          <p><b>Status:</b> <span style={{ color: '#e65100', fontWeight: 600 }}>{order.status || 'Order Confirmed'}</span></p>
          <div style={{ margin: '20px 0 10px 0', fontWeight: 600, color: '#444' }}>Payment Method</div>
          <div style={{ color: '#e65100', fontWeight: 500, marginBottom: 12 }}>{order.paymentMethod || 'Cash on Delivery'}</div>
          <div style={{ fontWeight: 600, color: '#444', marginBottom: 2 }}>Contact Information</div>
          <div style={{ marginBottom: 2 }}>Name: <b>{order.contactName || ''}</b></div>
          <div style={{ marginBottom: 2 }}>Email: <b>{order.buyerEmail || ''}</b></div>
          <div style={{ marginBottom: 2 }}>Phone: <b>{order.contactPhone || ''}</b></div>
          <div style={{ fontWeight: 600, color: '#444', margin: '8px 0 2px 0' }}>Delivery Information</div>
          <div style={{ marginBottom: 2 }}>Division: <b>{order.deliveryDivision || ''}</b></div>
          <div style={{ marginBottom: 2 }}>District: <b>{order.deliveryDistrict || ''}</b></div>
          <div style={{ marginBottom: 2 }}>Address: <b>{order.deliveryAddress || ''}</b></div>
        </div>
        <div className="order-progress-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '32px 0 24px 0', padding: '0 12px' }}>
          {ORDER_STAGES.map((stage, idx) => {
            const isActive = idx <= (ORDER_STAGES.indexOf(order.status || 'Order Confirmed'));
            const isCurrent = idx === (ORDER_STAGES.indexOf(order.status || 'Order Confirmed'));
            return (
              <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: isActive ? (isCurrent ? '#fff3e0' : '#e65100') : '#eee',
                    border: isCurrent ? '3px solid #e65100' : '2px solid #bbb',
                    color: isActive ? '#e65100' : '#bbb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 18,
                    boxShadow: isCurrent ? '0 0 8px #ffcc80' : '',
                    zIndex: 2,
                    transition: 'all 0.2s',
                  }}
                >
                  {isCurrent ? <span style={{fontSize:22}}>★</span> : idx + 1}
                </div>
                {idx < ORDER_STAGES.length - 1 && (
                  <div style={{
                    position: 'absolute',
                    top: 18,
                    left: '100%',
                    width: '100%',
                    height: 4,
                    background: isActive ? '#e65100' : '#eee',
                    zIndex: 1,
                    transition: 'background 0.2s',
                  }} />
                )}
                <span style={{ marginTop: 10, color: isActive ? '#e65100' : '#bbb', fontWeight: isCurrent ? 700 : 500, fontSize: 15 }}>{stage}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <label>
            <b>Update Status: </b>
            <select
               value={statusValue}
               onChange={handleStatusChange}
               style={{ marginLeft: 8, padding: 4, borderRadius: 4 }}
             >
              {ORDER_STAGES.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </label>
          {_error && <span style={{ color: 'red', marginLeft: 12 }}>{_error}</span>}
        </div>
      </div>
      {/* Admin Transaction History Style Table */}
      <div style={{ maxWidth: 900, margin: '32px auto 0 auto', background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)', padding: 24 }}>
        <div style={{ marginBottom: 12, fontWeight: 600, color: '#444', fontSize: 20 }}>Order Details</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="styled-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, background: '#fff' }}>
            <thead style={{ background: '#2196F3' }}>
              <tr>
                <th style={{ color: '#fff' }}>Title</th>
                <th style={{ color: '#fff' }}>Author</th>
                <th style={{ color: '#fff' }}>Category</th>
                <th style={{ color: '#fff' }}>Book Type</th>
                <th style={{ color: '#fff' }}>Condition</th>
                <th style={{ color: '#fff' }}>No. of Pages</th>
                <th style={{ color: '#fff' }}>Price (Tk.)</th>
                <th style={{ color: '#fff' }}>Quantity</th>
                <th style={{ color: '#fff' }}>Seller</th>
                
                <th style={{ color: '#fff' }}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {books.map((ob, idx) => (
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
                 <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600, background: '#fff' }}>Subtotal:</td>
                 <td style={{ fontWeight: 700, textAlign: 'right', background: '#fff' }}>{itemTotal.toFixed(2)}</td>
               </tr>
               <tr>
                 <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600, background: '#fff' }}>Shipping Cost:</td>
                 <td style={{ fontWeight: 700, textAlign: 'right', background: '#fff' }}>{Number(shipping).toFixed(2)}</td>
               </tr>
               <tr>
                 <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600, background: '#fff' }}>Discount:</td>
                 <td style={{ fontWeight: 700, textAlign: 'right', background: '#fff' }}>-{Number(discount).toFixed(2)}</td>
               </tr>
               <tr>
                 <td colSpan={9} style={{ textAlign: 'right', fontWeight: 600, background: '#fff' }}>Order Total:</td>
                 <td style={{ fontWeight: 700, textAlign: 'right', background: '#fff' }}>{finalTotal.toFixed(2)}</td>
               </tr>
             </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
