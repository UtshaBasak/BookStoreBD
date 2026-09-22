import { useState } from 'react';

import type { Id, ReturnStatus } from '@shared/api.js';

import { apiFetch } from '../../config/api.js';
import { useReturnRequests, useUpdateReturnStatus } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import Pager from '../../components/Pager.js';

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

      const objectUrl = URL.createObjectURL(await response.blob());
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
    <div className="admin-panel p-4">
      <h2 className="text-2xl font-bold mb-4">Return Request Management</h2>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by book, buyer, seller, or description..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{ padding: 8, width: 320, maxWidth: '100%', borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : returnRequests.length === 0 ? (
        <p>No return requests found</p>
      ) : (
        <div className="overflow-x-auto tp-9">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr>
                <th className="p-2">Book Title</th>
                <th className="p-2">Buyer</th>
                <th className="p-2">Seller</th>
                <th className="p-2">Description</th>
                <th className="p-2">Images</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {returnRequests.map((request) => (
                <tr key={request._id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{request.bookTitle || 'N/A'}</td>
                  <td className="p-2">{request.userEmail || 'N/A'}</td>
                  <td className="p-2">{request.sellerEmail || 'N/A'}</td>
                  <td className="p-2">{request.defectDescription || 'N/A'}</td>
                  <td className="p-2">
                    {request.images && request.images.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {request.images.map((image, index) => (
                          <button
                            key={image}
                            type="button"
                            onClick={() => void openImage(image)}
                            disabled={opening === image}
                            className="bg-blue-500 text-white px-2 py-1 rounded"
                          >
                            {opening === image ? 'Opening...' : `View ${index + 1}`}
                          </button>
                        ))}
                      </div>
                    ) : (
                      'No images'
                    )}
                  </td>
                  <td className="p-2">{request.status || 'pending'}</td>
                  <td className="p-2">
                    {request.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(request._id, 'approved')}
                          className="bg-green-500 text-white px-2 py-1 rounded mr-2"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(request._id, 'rejected')}
                          className="bg-red-500 text-white px-2 py-1 rounded"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager
        page={currentPage}
        pageCount={pageCount}
        pageSize={PAGE_SIZE}
        total={total}
        onPage={setPage}
        noun="requests"
      />
    </div>
  );
}
