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
    order.status === 'Cancelled'
      ? 'Cancelled'
      : order.status === 'Delivered'
        ? 'Return period over'
        : 'Returns open on delivery';


  // The page used to carry `overflow-x: hidden`, which cut the toolbar off
  // rather than letting it wrap: hidden overflow does not scroll, it amputates.
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
