import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaImage, FaSearch, FaTimes, FaUndoAlt } from 'react-icons/fa';

import type { Id, ReturnStatus } from '@shared/api.js';

import { apiFetch } from '../../config/api.js';
import { useReturnRequests, useUpdateReturnStatus } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import Pager from '../../components/Pager.js';
import '../AdminPanel.css';

/** The colour of a request's status pill. */
const statusTone = (status: string) =>
  status === 'approved' ? 'is-good' : status === 'rejected' ? 'is-bad' : 'is-pending';

/** Requests per page. */
const PAGE_SIZE = 25;

export default function ReturnManagement() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  /*
   * This asked for every return request there is, and a request carries the
   * photographs of the defect as base64 on the document - so seven columns of
   * text downloaded every picture anybody had ever uploaded, for a button that
   * did not open them. The pictures are addresses now, and the button works.
   */
  const settledSearch = useDebounced(search);
  const requestsQuery = useReturnRequests({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const returnRequests = requestsQuery.data?.items ?? [];
  const total = requestsQuery.data?.total ?? 0;
  const pageCount = requestsQuery.data?.pageCount ?? 1;
  const currentPage = requestsQuery.data?.page ?? page;
  const loading = requestsQuery.isPending;

  const { mutateAsync: updateStatus } = useUpdateReturnStatus();
  const toast = useToast();

  /**
   * Opens one photograph.
   *
   * Not a plain link: the picture is only visible to an administrator or the
   * buyer who uploaded it, and the session lives in localStorage, so a new tab
   * would arrive with no Authorization header and be refused. It is fetched
   * with the session and handed to the tab as a blob instead.
   */
  const [opening, setOpening] = useState<string | null>(null);

  const openImage = async (url: string) => {
    setOpening(url);
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error(`Could not load that image (${response.status})`);

      const blob = await response.blob();
      // A blob opens in this origin, so what it claims to be matters: a
      // text/html blob in a tab is script running as the site. The endpoint
      // only ever serves image types, and this is the check that says so here
      // rather than trusting that it always will.
      if (!blob.type.startsWith('image/')) throw new Error('That file is not an image');

      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener');
      // The new tab has it now; this handle is released once it has loaded.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not open that image.');
    } finally {
      setOpening(null);
    }
  };

  const handleStatusUpdate = async (requestId: Id, status: ReturnStatus) => {
    try {
      // The mutation invalidates the list, so the table reflects the change
      // without this component keeping its own copy in sync.
      await updateStatus({ id: requestId, status });
      toast.success(`Return request ${status}.`);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not update the return request.');
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaUndoAlt />
            </span>
            Return Request Management
          </h2>
          <p className="admin-lede">
            Check the buyer&apos;s photographs, then approve or reject. An approved refund is paid to
            the bKash number shown.
          </p>
        </div>
      </header>

      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="field"
            placeholder="Search by book, buyer, seller, or description..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <p className="admin-loading">Loading...</p>
      ) : returnRequests.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            📦
          </span>
          <p>No return requests found</p>
        </div>
      ) : (
        <div className="admin-card">
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>Book Title</th>
                <th>Order</th>
                <th>Buyer</th>
                <th>Refund to (bKash)</th>
                <th>Seller</th>
                <th>Description</th>
                <th>Images</th>
                <th>Status</th>
                <th className="admin-sticky-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {returnRequests.map((request) => (
                <tr key={request._id}>
                  <td className="admin-cell-strong" style={{ minWidth: 140 }}>{request.bookTitle || 'N/A'}</td>
                  <td>
                    {request.orderNumber ? (
                      <Link className="admin-mono" to={`/admin/order-tracking/${request.orderNumber}`}>{request.orderNumber}</Link>
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td>{request.userEmail || 'N/A'}</td>
                  {/* Refunds are paid by bKash; without this an approval could not be paid. */}
                  <td className="admin-mono admin-nowrap">{request.refundBkash || 'Not given'}</td>
                  <td>{request.sellerEmail || 'N/A'}</td>
                  <td style={{ minWidth: 200, maxWidth: 320 }}>{request.defectDescription || 'N/A'}</td>
                  <td>
                    {request.images && request.images.length > 0 ? (
                      <div className="admin-row-actions" style={{ flexWrap: 'nowrap' }}>
                        {request.images.map((image, index) => (
                          <button
                            key={image}
                            type="button"
                            onClick={() => void openImage(image)}
                            disabled={opening === image}
                            className="btn btn-ghost admin-btn-sm"
                          >
                            <FaImage aria-hidden="true" />
                            {opening === image ? 'Opening...' : `View ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="admin-cell-muted">No images</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge admin-status ${statusTone(request.status || 'pending')}`}>
                      {request.status || 'pending'}
                    </span>
                  </td>
                  <td className="admin-sticky-end">
                    {request.status === 'pending' && (
                      <div className="admin-row-actions" style={{ flexWrap: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(request._id, 'approved')}
                          className="btn btn-primary admin-btn-sm"
                        >
                          <FaCheck aria-hidden="true" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(request._id, 'rejected')}
                          className="btn btn-danger admin-btn-sm"
                        >
                          <FaTimes aria-hidden="true" />
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      <div className="admin-pager">
        <Pager
          page={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          noun="requests"
        />
      </div>
    </div>
  );
}
