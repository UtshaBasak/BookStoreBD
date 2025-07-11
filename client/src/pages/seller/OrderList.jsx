import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function SellerOrderList() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    if (!userEmail) return;
    axios.get(`http://localhost:4000/order/seller?email=${encodeURIComponent(userEmail)}`)
      .then(res => setOrders(Array.isArray(res.data) ? res.data : []));
  }, [userEmail]);

  // Filter orders by title, buyer email, or order number
  const filteredOrders = orders.filter(order =>
    (order.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (order.buyerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
    (order._id || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2>Books Sold</h2>
      <input
        type="text"
        placeholder="Search by order number, title, author or buyer..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc', marginBottom: 16 }}
      />
      {filteredOrders.map(order => (
        <div key={order._id} className="order-card">
          <div>
            <b>Order ID:</b> {order._id} <b>Status:</b> {order.status}
          </div>
          <div>
            <span>{order.title}</span> to <span>{order.buyerEmail}</span>
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
