import { useEffect, useState } from 'react';
import axios from 'axios';

import type { OrderLine } from '@shared/api.js';

import { API_BASE_URL } from '../../config/api.js';

export default function TransactionHistory() {
  const [orders, setOrders] = useState<OrderLine[]>([]);

  useEffect(() => {
    axios.get<OrderLine[]>(`${API_BASE_URL}/order/admin/all`)
      .then(res => setOrders(Array.isArray(res.data) ? res.data : []));
  }, []);

  return (
    <div>
      <h2>Transaction History</h2>
      <table>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Buyer</th>
            <th>Seller</th>
            <th>Book</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order._id}>
              <td>{order._id}</td>
              <td>{order.buyerEmail}</td>
              <td>{order.sellerEmail}</td>
              <td>{order.title}</td>
              <td>{order.status}</td>
              <td>{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
