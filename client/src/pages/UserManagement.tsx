import { useState } from 'react';
import { FaSearch, FaTrashAlt, FaUsers } from 'react-icons/fa';

import type { AccountBlockedResponse, Id } from '@shared/api.js';
import './AdminPanel.css';
import './UserManagement.css';
import { useUsers, useDeleteUser } from '../hooks/queries.js';
import { ApiRequestError } from '../utils/apiError.js';
import { formatDate, t } from '../utils/language.js';
import { useDebounced } from '../hooks/useDebounced.js';
import Pager from '../components/Pager.js';
import { FilterSelect, RefreshButton } from './admin/AdminControls.js';

/** The reasons an account cannot be deleted yet, when that is why it failed. */
const blockersOf = (error: Error): string[] => {
  const body = error instanceof ApiRequestError ? (error.body as Partial<AccountBlockedResponse> | undefined) : undefined;
  return Array.isArray(body?.blockers) ? body.blockers : [];
};

/** Rows per page. Enough to scan, few enough to draw. */
const PAGE_SIZE = 25;

const KINDS = () => [
  { value: '', label: t('Everyone', 'সবাই') },
  { value: 'sellers', label: t('Sellers', 'বিক্রেতা') },
  { value: 'buyers', label: t('Buyers only', 'শুধু ক্রেতা') },
];
const SORTS = () => [
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
  { value: 'nameAZ', label: t('Name A-Z', 'নাম A-Z') },
  { value: 'nameZA', label: t('Name Z-A', 'নাম Z-A') },
];

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState('newest');
  // Any change but the page starts again from the first one.
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  /*
   * Searched and paged by the API, which also leaves administrators out, so
   * the count below is the count of what matched. Loading, error and refetch
   * state come from the query.
   */
  const settledSearch = useDebounced(search);
  const { data, isPending, isFetching, error, refetch } = useUsers({
    search: settledSearch || undefined,
    page,
    pageSize: PAGE_SIZE,
    filters: { kind, sort },
  });

  const users = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;
  const currentPage = data?.page ?? page;

  const { mutate: removeUser, error: deleteError } = useDeleteUser();

  const deleteUser = (id: Id) => removeUser(id);

  if (isPending) return <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>;
  if (error) {
    return (
      <div className="admin-alert">
        {t('Error:', 'ত্রুটি:')} {error.message}
      </div>
    );
  }

  return (
    <div className="user-management admin-page">
      <header className="user-management-header admin-page-head">
        <div>
          <h1 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaUsers />
            </span>
            {t('User Management', 'ব্যবহারকারী ব্যবস্থাপনা')}
          </h1>
          <p className="admin-lede">
            {t(
              'Everyone who has signed up to buy or sell. Search by name or email address.',
              'কেনা বা বেচার জন্য যাঁরা সাইন আপ করেছেন, সবাই। নাম বা ই-মেইল ঠিকানা দিয়ে খুঁজুন।'
            )}
          </p>
        </div>
        <RefreshButton onClick={() => void refetch()} busy={isFetching} />
      </header>
      <div className="admin-toolbar">
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input name="q"
            type="text"
            className="field"
            placeholder={t('Search by username or email...', 'ইউজারনেম বা ই-মেইল দিয়ে খুঁজুন...')}
            aria-label={t('Search accounts', 'অ্যাকাউন্ট খুঁজুন')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // A new search starts from its first page.
              setPage(1);
            }}
          />
        </div>
        <FilterSelect name="kind" label={t('Show', 'দেখান')} value={kind} onChange={change(setKind)} options={KINDS()} />
        <FilterSelect name="sort" label={t('Sort', 'সাজান')} value={sort} onChange={change(setSort)} options={SORTS()} />
      </div>
      {deleteError && (
        <div role="alert" className="admin-alert">
          {t('Could not delete that user:', 'ব্যবহারকারীকে মোছা যায়নি:')} {deleteError.message}
          {/* What has to finish first: an order on its way, a return, a payout. */}
          {blockersOf(deleteError).length > 0 && (
            <ul className="m-0 mt-1 pl-5">
              {blockersOf(deleteError).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="admin-card">
        <div className="table-scroll">
          <table className="styled-table">
            <thead>
              <tr>
                <th>{t('Username', 'ইউজারনেম')}</th>
                <th>{t('Email', 'ই-মেইল')}</th>
                <th>{t('Created At', 'যোগদানের তারিখ')}</th>
                <th>{t('Actions', 'কাজ')}</th>
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
                    {user.createdAt ? formatDate(user.createdAt, undefined, 'en-GB') : ''}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger admin-btn-sm"
                      onClick={() => deleteUser(user._id)}
                    >
                      <FaTrashAlt aria-hidden="true" />
                      {t('Delete', 'মুছুন')}
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
            <p>
              {kind
                ? t('No account matches those filters.', 'এই ফিল্টারের সঙ্গে মেলে এমন কোনো অ্যাকাউন্ট নেই।')
                : t('No account matches that search.', 'এই খোঁজের সঙ্গে মেলে এমন কোনো অ্যাকাউন্ট নেই।')}
            </p>
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
          noun={t('accounts', 'অ্যাকাউন্ট')}
        />
      </div>
    </div>
  );
}
