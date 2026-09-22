import { useState } from 'react';

import type { Id } from '@shared/api.js';
import './UserManagement.css';
import { useUsers, useDeleteUser } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';

/** Rows per page. Enough to scan, few enough to draw. */
const PAGE_SIZE = 25;

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  /*
   * This table used to fetch every account with every field except the
   * password - including `profilePicture`, a base64 data URI - to draw three
   * columns, and then search what it had in the browser. Both are the API's
   * job now, and administrators are left out there rather than here, so the
   * count below is the count of what matched.
   *
   * Loading, error and refetch state come from the query rather than being
   * reimplemented with four useState flags per page.
   */
  const settledSearch = useDebounced(search);
  const { data, isPending, isFetching, error, refetch } = useUsers({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  const currentPage = data?.page ?? page;

  const { mutate: removeUser, error: deleteError } = useDeleteUser();

  const deleteUser = (id: Id) => removeUser(id);

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="user-management">
      <header className="user-management-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>User Management</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          style={{
            backgroundColor: '#43a047',
            color: 'white',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '4px',
            cursor: isFetching ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      {/* Search input */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            // Page 4 of a search nobody is running any more is a dead end.
            setPage(1);
          }}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>
      {deleteError && (
        <p role="alert" style={{ color: '#c0392b' }}>
          Could not delete that user: {deleteError.message}
        </p>
      )}
      <table className="styled-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Created At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user._id}>
              <td>{user.username}</td>
              <td>{user.email}</td>
              <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : ''}</td>
              <td>
                <button onClick={() => deleteUser(user._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {users.length === 0 && !isFetching && (
        <p style={{ marginTop: 16 }}>No account matches that search.</p>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 16,
        }}
      >
        <span>
          {total === 0
            ? 'No accounts'
            : `Showing ${String((currentPage - 1) * PAGE_SIZE + 1)}–${String(
                Math.min(currentPage * PAGE_SIZE, total)
              )} of ${String(total)}`}
        </span>

        {pageCount > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              style={{ minHeight: 40, padding: '0 14px' }}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === pageCount}
              style={{ minHeight: 40, padding: '0 14px' }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
