import { useState } from 'react';

import type { BuyerOrderLine, Id } from '@shared/api.js';
import { useNavigate } from 'react-router-dom';

import { useBuyerOrders, useReturnRequests } from '../hooks/queries.js';

export default function BuyerBookList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const ordersQuery = useBuyerOrders({
    select: (data) => (Array.isArray(data) ? data : []),
  });
  const orders = ordersQuery.data ?? [];
  const loading = ordersQuery.isPending;

  // The server scopes return requests to the caller, so no e-mail is passed.
  const { data: returnStatuses = {} } = useReturnRequests({
    select: (list) =>
      Object.fromEntries((list ?? []).map((request) => [request.bookId, request.status])),
  });

  const refreshing = ordersQuery.isFetching;
  const handleRefresh = () => ordersQuery.refetch();

  const handleReturn = (bookId: Id, order: BuyerOrderLine) => {
    // The optimistic local edit is gone: the return is actually submitted on
    // the next page, and the orders query is the single source for this list.
    navigate(`/description-form/${bookId}`, {
      state: {
        orderId: order._id,
        bookTitle: order.title,
        orderDate: order.createdAt,
        sellerEmail: order.sellerEmail
      }
    });
  };

  const isWithinReturnPeriod = (orderDate: string | undefined) => {
    const orderDateTime = new Date(orderDate ?? 0).getTime();
    const currentDateTime = new Date().getTime();
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
    return currentDateTime - orderDateTime <= threeDaysInMs;
  };

  const filteredOrders = orders.filter(
    order =>
      (order.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.author || '').toLowerCase().includes(search.toLowerCase()) ||
      (order.sellerEmail || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ width: '100vw', minHeight: '100vh', boxSizing: 'border-box', padding: '2rem', background: '#fff', overflowX: 'hidden' }}>
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
        <input
          type="text"
          placeholder="Search by title, author, or seller..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc', marginLeft: 16 }}
        />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            marginLeft: 16
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <h2>Your Purchased Books</h2>
      <div style={{ overflowX: 'auto', background: '#fff' }}>
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
              <th>Created at</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11}>Loading...</td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={11}>No books purchased yet.</td></tr>
            ) : (
              filteredOrders.map((order, idx) => (
                <tr key={order._id || idx}>
                  <td>{order.title}</td>
                  <td>{order.author}</td>
                  <td>{Array.isArray(order.category) ? order.category.join(', ') : order.category}</td>
                  <td>{order.bookType}</td>
                  <td>{order.condition}</td>
                  <td>{order.pages}</td>
                  <td>{order.price}</td>
                  <td>{order.quantity}</td>
                  <td>{order.sellerEmail}</td>
                  <td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</td>
                  <td>
                    {returnStatuses[order.bookId] ? (
                      <span className={`px-2 py-1 rounded ${
                        returnStatuses[order.bookId] === 'pending' ? 'bg-yellow-200 text-yellow-800' :
                        returnStatuses[order.bookId] === 'approved' ? 'bg-green-200 text-green-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        Return {returnStatuses[order.bookId]}
                      </span>
                    ) : isWithinReturnPeriod(order.createdAt) ? (
                      <button
                        onClick={() => handleReturn(order.bookId, order)}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                      >
                        Return
                      </button>
                    ) : (
                      <span className="text-red-500">Return period expired</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
