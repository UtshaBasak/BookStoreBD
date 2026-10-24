import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaImage, FaSearch, FaTimes, FaUndoAlt } from 'react-icons/fa';

import type { Id, ReturnStatus } from '@shared/api.js';

import { apiFetch } from '../../config/api.js';
import { useReturnRequests, useUpdateReturnStatus } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import { formatNumber, t } from '../../utils/language.js';
import { returnStatusLabel } from '../../utils/orderStatus.js';
import Pager from '../../components/Pager.js';
import { FilterSelect, RefreshButton } from './AdminControls.js';
import '../AdminPanel.css';

/** The colour of a request's status pill. */
const statusTone = (status: string) =>
  status === 'approved' ? 'is-good' : status === 'rejected' ? 'is-bad' : 'is-pending';

/** Requests per page. */
const PAGE_SIZE = 25;

const STATUSES = () => [
  { value: '', label: t('Any status', 'যেকোনো অবস্থা') },
  { value: 'pending', label: t('Pending', 'অপেক্ষমাণ') },
  { value: 'approved', label: t('Approved', 'অনুমোদিত') },
  { value: 'rejected', label: t('Rejected', 'প্রত্যাখ্যাত') },
];
const SORTS = () => [
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
];

export default function ReturnManagement() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');

  /*
   * Searched and paged by the API. Each request carries its photographs as
   * addresses rather than inline data, so the table stays light and a picture
   * is fetched only when it is opened.
   */
  const settledSearch = useDebounced(search);
  const requestsQuery = useReturnRequests({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { status, sort },
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
      if (!response.ok) {
        throw new Error(t(`Could not load that image (${response.status})`, `ছবিটি লোড করা যায়নি (${response.status})`));
      }

      const blob = await response.blob();
      // A blob opens in this origin, so its type matters: a text/html blob in
      // a tab would run as the site. The endpoint serves only images; this
      // check enforces that here as well.
      if (!blob.type.startsWith('image/')) throw new Error(t('That file is not an image', 'ফাইলটি ছবি নয়'));

      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener');
      // The new tab has it now; this handle is released once it has loaded.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not open that image.', 'ছবিটি খোলা যায়নি।'));
    } finally {
      setOpening(null);
    }
  };

  const handleStatusUpdate = async (requestId: Id, status: ReturnStatus) => {
    try {
      // The mutation invalidates the list, so the table reflects the change
      // without this component keeping its own copy in sync.
      await updateStatus({ id: requestId, status });
      toast.success(
        t(
          `Return request ${status}.`,
          status === 'approved' ? 'ফেরতের অনুরোধ অনুমোদন করা হয়েছে।' : 'ফেরতের অনুরোধ প্রত্যাখ্যান করা হয়েছে।'
        )
      );
    } catch (error) {
      toast.error(messageOf(error) || t('Could not update the return request.', 'ফেরতের অনুরোধ হালনাগাদ করা যায়নি।'));
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
            {t('Return Request Management', 'ফেরতের অনুরোধ ব্যবস্থাপনা')}
          </h2>
          <p className="admin-lede">
            {t(
              "Check the buyer's photographs, then approve or reject. An approved refund is paid to the bKash number shown.",
              'ক্রেতার ছবিগুলো দেখে অনুমোদন বা প্রত্যাখ্যান করুন। অনুমোদিত হলে টাকা দেখানো বিকাশ নম্বরে ফেরত পাঠানো হয়।'
            )}
          </p>
        </div>
        <RefreshButton onClick={() => void requestsQuery.refetch()} busy={requestsQuery.isFetching} />
      </header>

      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            aria-label={t('Search return requests', 'ফেরতের অনুরোধ খুঁজুন')}
            placeholder={t('Search by book, buyer, seller, or description...', 'বই, ক্রেতা, বিক্রেতা বা বিবরণ দিয়ে খুঁজুন...')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <FilterSelect
          name="status"
          label={t('Status', 'অবস্থা')}
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={STATUSES()}
        />
        <FilterSelect
          name="sort"
          label={t('Sort', 'সাজান')}
          value={sort}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
          options={SORTS()}
        />
      </div>

      {loading ? (
        <p className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</p>
      ) : returnRequests.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            📦
          </span>
          <p>{t('No return requests found', 'কোনো ফেরতের অনুরোধ পাওয়া যায়নি')}</p>
        </div>
      ) : (
        <div className="admin-card">
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>{t('Book Title', 'বইয়ের নাম')}</th>
                <th>{t('Order', 'অর্ডার')}</th>
                <th>{t('Buyer', 'ক্রেতা')}</th>
                <th>{t('Refund to (bKash)', 'টাকা ফেরত (বিকাশ)')}</th>
                <th>{t('Seller', 'বিক্রেতা')}</th>
                <th>{t('Description', 'বিবরণ')}</th>
                <th>{t('Images', 'ছবি')}</th>
                <th>{t('Status', 'অবস্থা')}</th>
                <th className="admin-sticky-end">{t('Actions', 'কাজ')}</th>
              </tr>
            </thead>
            <tbody>
              {returnRequests.map((request) => (
                <tr key={request._id}>
                  <td className="admin-cell-strong" style={{ minWidth: 140 }}>{request.bookTitle || t('N/A', 'নেই')}</td>
                  <td>
                    {request.orderNumber ? (
                      <Link className="admin-mono" to={`/admin/order-tracking/${request.orderNumber}`}>{request.orderNumber}</Link>
                    ) : (
                      t('N/A', 'নেই')
                    )}
                  </td>
                  <td>{request.userEmail || t('N/A', 'নেই')}</td>
                  {/* Refunds are paid by bKash; without this an approval could not be paid. */}
                  <td className="admin-mono admin-nowrap">{request.refundBkash || t('Not given', 'দেওয়া হয়নি')}</td>
                  <td>{request.sellerEmail || t('N/A', 'নেই')}</td>
                  <td style={{ minWidth: 200, maxWidth: 320 }}>{request.defectDescription || t('N/A', 'নেই')}</td>
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
                            {opening === image ? t('Opening...', 'খোলা হচ্ছে...') : t(`View ${index + 1}`, `দেখুন ${formatNumber(index + 1)}`)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="admin-cell-muted">{t('No images', 'কোনো ছবি নেই')}</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge admin-status ${statusTone(request.status || 'pending')}`}>
                      {returnStatusLabel(request.status || 'pending', request.status || 'pending')}
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
                          {t('Approve', 'অনুমোদন করুন')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(request._id, 'rejected')}
                          className="btn btn-danger admin-btn-sm"
                        >
                          <FaTimes aria-hidden="true" />
                          {t('Reject', 'প্রত্যাখ্যান করুন')}
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
          noun={t('requests', 'অনুরোধ')}
        />
      </div>
    </div>
  );
}
