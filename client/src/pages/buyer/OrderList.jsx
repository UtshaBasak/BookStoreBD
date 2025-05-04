import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function BuyerOrderList() {
  const [orders, setOrders] = useState([]);
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) return;
    axios.get(`http://localhost:1015/order/buyer?email=${encodeURIComponent(userEmail)}`)
      .then(res => setOrders(Array.isArray(res.data) ? res.data : []));
  }, [userEmail]);

  return (
    <div>
      <h2>Your Orders</h2>
      {orders.map(order => (
        <div key={order._id} className="order-card">
          <div>
            <b>Order ID:</b> {order._id} <b>Status:</b> {order.status}
          </div>
          <div>
            <span>{order.title}</span> by <span>{order.author}</span>
            <span> | Seller: {order.sellerEmail}</span>
            <span> | Quantity: {order.quantity}</span>
          </div>
          <button onClick={() => navigate(`/order-tracking/${order._id}`)}>
            Track Order
          </button>
        </div>
      ))}
    </div>
  );
}