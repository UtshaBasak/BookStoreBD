import { useState } from 'react';
import { FaSearch, FaSyncAlt, FaTrashAlt, FaUsers } from 'react-icons/fa';

import type { Id } from '@shared/api.js';
import './AdminPanel.css';
import './UserManagement.css';
import { useUsers, useDeleteUser } from '../hooks/queries.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';

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

  if (isPending) return <div className="admin-loading">Loading...</div>;
  if (error) return <div className="admin-alert">Error: {error.message}</div>;

  return (
    <div className="user-management admin-page">
      <header className="user-management-header admin-page-head">
        <div>
          <h1 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaUsers />
            </span>
            User Management
          </h1>
          <p className="admin-lede">
            Everyone who has signed up to buy or sell. Search by name or email address.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost admin-btn-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <FaSyncAlt aria-hidden="true" className={isFetching ? 'admin-spin' : undefined} />
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      {/* Search input */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // Page 4 of a search nobody is running any more is a dead end.
              setPage(1);
            }}
          />
        </div>
      </div>
      {deleteError && (
        <p role="alert" className="admin-alert">
          Could not delete that user: {deleteError.message}
        </p>
      )}
      <div className="admin-card">
        <div className="table-scroll">
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
                  <td>
                    <span className="admin-person">
                      <span className="admin-avatar" aria-hidden="true">
                        {user.username ? user.username.charAt(0) : '?'}
                      </span>
                      <span className="admin-cell-strong">{user.username}</span>
                    </span>
                  </td>
                  <td className="user-email">{user.email}</td>
                  <td className="admin-nowrap">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : ''}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger admin-btn-sm"
                      onClick={() => deleteUser(user._id)}
                    >
                      <FaTrashAlt aria-hidden="true" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && !isFetching && (
          <div className="admin-empty">
            <span className="admin-empty-mark" aria-hidden="true">
              🔍
            </span>
            <p>No account matches that search.</p>
          </div>
        )}
      </div>

      <div className="admin-pager">
        <Pager
          page={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          noun="accounts"
        />
      </div>
    </div>
  );
}
