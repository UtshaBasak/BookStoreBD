import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function PaymentConfirmationPage({ order }) {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Payment Confirmation</h1>
      <p>Your payment has been successfully processed.</p>
      <p>Order ID: {order._id}</p>
      <button
        onClick={() => navigate(`/order-tracking/${order._id}`)}
        className="track-order-btn"
      >
        Track Your Order
      </button>
    </div>
  );
}