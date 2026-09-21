import { useAllOrders } from '../../hooks/queries.js';

export default function TransactionHistory() {
  // The same query the root-level transaction page uses, so opening both costs
  // one request rather than two.
  const { data: orders = [] } = useAllOrders({
    select: (data) => (Array.isArray(data) ? data : []),
  });

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
