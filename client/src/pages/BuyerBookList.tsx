import { useState } from 'react';

import type { BuyerOrderLine } from '@shared/api.js';
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

  const handleReturn = (order: BuyerOrderLine) => {
    // The optimistic local edit is gone: the return is actually submitted on
    // the next page, and the orders query is the single source for this list.
    // Addressed by order line, so the form still knows what it is returning
    // after a reload has thrown the navigation state away.
    navigate(`/description-form/${order._id}`, {
      state: {
        bookTitle: order.title,
        returnableUntil: order.returnableUntil,
      }
    });
  };

  /*
   * Whether a line can be returned is the server's answer, sent with it. This
   * page used to work it out from the order date - three days from ordering,
   * so a book still in transit could run out of time before it arrived - and
   * the server checked nothing at all.
   */
  const returnLabel = (order: BuyerOrderLine) =>
    order.status === 'Delivered' ? 'Return period over' : 'Returns open on delivery';


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
              {/*
                Next to the title: on a phone this table scrolls sideways, and
                last in the row the button was off the screen for the person
                most likely to be looking for it.
              */}
              <th>Return</th>
              <th>Author</th>
              <th>Category</th>
              <th>Book Type</th>
              <th>Condition</th>
              <th>No. of Pages</th>
              <th>Price (Tk.)</th>
              <th>Quantity</th>
              <th>Seller</th>
              <th>Created at</th>
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
                  <td>
                    {order.returnStatus ? (
                      <span className={`px-2 py-1 rounded ${
                        order.returnStatus === 'pending' ? 'bg-yellow-200 text-yellow-800' :
                        order.returnStatus === 'approved' ? 'bg-green-200 text-green-800' :
                        'bg-red-200 text-red-800'
                      }`}>
                        Return {order.returnStatus}
                      </span>
                    ) : order.returnableUntil ? (
                      <div className="flex flex-col items-start gap-1">
                        <button
                          onClick={() => handleReturn(order)}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                          style={{ minHeight: 44 }}
                        >
                          Return
                        </button>
                        <span className="text-xs text-gray-600">
                          Until {new Date(order.returnableUntil).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-600">{returnLabel(order)}</span>
                    )}
                    {order.returnStatus === 'approved' && (
                      <p className="mt-1 text-xs text-gray-600">
                        We have e-mailed you where to send it.
                      </p>
                    )}
                  </td>
                  <td>{order.author}</td>
                  <td>{Array.isArray(order.category) ? order.category.join(', ') : order.category}</td>
                  <td>{order.bookType}</td>
                  <td>{order.condition}</td>
                  <td>{order.pages}</td>
                  <td>{order.price}</td>
                  <td>{order.quantity}</td>
                  <td>{order.sellerEmail}</td>
                  <td>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</td>
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
