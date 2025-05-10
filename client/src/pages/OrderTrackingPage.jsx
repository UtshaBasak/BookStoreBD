import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import '../styles/orderTracking.css';

const ORDER_STAGES = [
  'Order Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered'
];

export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const userEmail = localStorage.getItem('userEmail');
  const userRole = localStorage.getItem('role'); // e.g. 'admin' or 'seller'

  useEffect(() => {
    if (!orderId) return;
    axios.get(`http://localhost:1015/order/${orderId}`)
      .then(res => setOrder(res.data))
      .catch(() => setOrder(null));
  }, [orderId]);

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    setUpdating(true);
    setError('');
    try {
      const res = await axios.patch(`http://localhost:1015/order/status/${orderId}`, { status: newStatus });
      setOrder(res.data);
    } catch {
      setError('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  if (!order) return <div>Loading...</div>;

  const currentStage = ORDER_STAGES.indexOf(order.status);

  // Only admin or the seller of this order can update status
  const canUpdateStatus =
    userRole === 'admin' ||
    (userRole === 'seller' && userEmail && userEmail === order.sellerEmail);

  return (
    <div className="order-tracking-container">
      <h2>Track Your Order</h2>
      <div className="order-info">
        <p><b>Order ID:</b> {order._id}</p>
        <p><b>Placed On:</b> {new Date(order.createdAt).toLocaleString()}</p>
        <p><b>Status:</b> {order.status}</p>
        <p><b>Book:</b> {order.title} by {order.author}</p>
        <p><b>Seller:</b> {order.sellerEmail}</p>
        <p><b>Quantity:</b> {order.quantity}</p>
        {canUpdateStatus && (
          <div style={{ marginTop: 16 }}>
            <label>
              <b>Update Status: </b>
              <select
                value={order.status}
                onChange={handleStatusChange}
                disabled={updating}
                style={{ marginLeft: 8, padding: 4, borderRadius: 4 }}
              >
                {ORDER_STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </label>
            {error && <span style={{ color: 'red', marginLeft: 12 }}>{error}</span>}
          </div>
        )}
      </div>
      <div className="tracking-stages">
        {ORDER_STAGES.map((stage, idx) => (
          <div key={stage} className={`stage${idx <= currentStage ? ' active' : ''}`}>
            <span className="stage-dot" />
            <span className="stage-label">{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
