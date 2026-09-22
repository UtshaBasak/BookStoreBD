import { useState } from 'react';

import type { BuyerOrderLine, Id } from '@shared/api.js';
import { useNavigate } from 'react-router-dom';

import { useBuyerOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

export default function BuyerBookList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);

  /*
   * This fetched every order this account has ever placed and searched them
   * here - and, to know whether a book already had a return in progress, every
   * return request the account had ever made. A return request carries the
   * photographs of the defect as base64, so that second list was the expensive
   * one. Each line now arrives with its own `returnStatus`.
   */
  const settledSearch = useDebounced(search);
  const ordersQuery = useBuyerOrders({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;
  const pageCount = ordersQuery.data?.pageCount ?? 1;
  const currentPage = ordersQuery.data?.page ?? page;
  const loading = ordersQuery.isPending;
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


  // The page used to carry `overflow-x: hidden`, which cut the toolbar off
  // rather than letting it wrap: hidden overflow does not scroll, it amputates.
  return (
    <div className="min-h-screen w-full p-4 sm:p-8" style={{ boxSizing: 'border-box', background: '#fff' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
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
        <div className="table-scroll">
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
            ) : orders.length === 0 ? (
              <tr><td colSpan={11}>No books purchased yet.</td></tr>
            ) : (
              orders.map((order, idx) => (
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
                    {order.returnStatus ? (
                      <span className={`px-2 py-1 rounded ${
                        order.returnStatus === 'pending' ? 'bg-yellow-200 text-yellow-800' :
                        order.returnStatus === 'approved' ? 'bg-green-200 text-green-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        Return {order.returnStatus}
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

        <Pager
          page={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          noun="orders"
        />
      </div>
    </div>
  );
}
