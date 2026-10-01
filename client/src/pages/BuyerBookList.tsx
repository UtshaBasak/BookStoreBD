import { useState } from 'react';

import type { BuyerOrderLine } from '@shared/api.js';
import { useNavigate, Link } from 'react-router-dom';
import { FaSearch, FaUndoAlt } from 'react-icons/fa';

import { useBuyerOrders } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';
import '../styles/orderTracking.css';

/** Orders per page. Each one may be several rows. */
const PAGE_SIZE = 25;

/** A return's pill: pending amber, approved green, anything else red. */
const returnColours = (status: string) =>
  status === 'pending'
    ? { background: '#fff7ed', color: '#c2410c' }
    : status === 'approved'
      ? { background: '#ecfdf5', color: '#047857' }
      : { background: '#fef2f2', color: '#b91c1c' };

export default function BuyerBookList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);

  /*
   * Searched and paged by the API. Each line carries its own `returnStatus`,
   * so the page never loads the account's return requests, which hold the
   * defect photographs as base64.
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
    // The return is submitted on the next page; the orders query stays the
    // single source for this list. Addressed by order line, so the form still
    // knows what it is returning after a reload drops the navigation state.
    navigate(`/description-form/${order._id}`, {
      state: {
        bookTitle: order.title,
        returnableUntil: order.returnableUntil,
      }
    });
  };

  /*
   * Whether a line can be returned is the server's answer, sent with it, so
   * the return window runs from delivery and is enforced in one place.
   */
  const returnLabel = (order: BuyerOrderLine) =>
    order.status === 'Cancelled'
      ? 'Cancelled'
      : order.status === 'Delivered'
        ? 'Return period over'
        : 'Returns open on delivery';

  // No `overflow-x: hidden` on the page: it would clip the toolbar rather
  // than let it wrap.
  return (
    <div className="ot-page">
      <div className="ot-wrap" style={{ maxWidth: 1200 }}>
        <div className="ot-toolbar">
          <Link to="/profile?mode=buyer" className="btn btn-ghost">
            ← Return to Profile
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="ot-kicker">📚 Your library</p>
            <h1 className="m-0" style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.2rem)' }}>Your Purchased Books</h1>
            <p className="m-0 mt-1 text-sm text-ink-muted">
              Something wrong with a book? Ask for a return from its row, or send back a whole order
              at once from <Link to="/buyer/orders">Your Orders</Link>.
            </p>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1" style={{ maxWidth: 440, minWidth: 220 }}>
            <FaSearch
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
            />
            <input name="q"
              type="text"
              className="field"
              style={{ paddingLeft: 42, borderRadius: 999 }}
              placeholder="Search by title, author, or seller..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ cursor: refreshing ? 'not-allowed' : 'pointer' }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="table-scroll">
        <table className="styled-table ot-table">
          <thead>
            <tr>
              <th>Title</th>
              {/*
                Next to the title: on a phone this table scrolls sideways, and
                here the return button stays on screen.
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
              <tr><td colSpan={11} className="py-8 text-center text-ink-muted">No books purchased yet.</td></tr>
            ) : (
              orders.map((order, idx) => (
                <tr key={order._id || idx}>
                  <td className="font-semibold text-ink" style={{ minWidth: 140 }}>
                    <Link to={`/book/${order.bookId}`}>{order.title}</Link>
                  </td>
                  <td style={{ minWidth: 150 }}>
                    {order.returnStatus ? (
                      <span className="ot-pill" style={returnColours(order.returnStatus)}>
                        Return {order.returnStatus}
                      </span>
                    ) : order.returnableUntil ? (
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          onClick={() => handleReturn(order)}
                          className="btn btn-primary"
                          style={{ minHeight: 44, padding: '0 18px' }}
                        >
                          <FaUndoAlt aria-hidden="true" size={12} /> Return
                        </button>
                        <span className="text-xs text-ink-muted">
                          Until {new Date(order.returnableUntil).toLocaleDateString()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-ink-muted">{returnLabel(order)}</span>
                    )}
                    {order.returnStatus === 'approved' && (
                      <p className="m-0 mt-1 text-xs text-ink-muted">
                        We have e-mailed you where to send it.
                      </p>
                    )}
                  </td>
                  <td>{order.author}</td>
                  <td>{Array.isArray(order.category) ? order.category.join(', ') : order.category}</td>
                  <td>{order.bookType}</td>
                  <td>{order.condition}</td>
                  <td>{order.pages}</td>
                  <td className="font-bold" style={{ color: '#ff5c35' }}>{order.price}</td>
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
