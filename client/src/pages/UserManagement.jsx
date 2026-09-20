import React, { useState } from 'react';
import './UserManagement.css';
import { useUsers, useDeleteUser } from '../hooks/queries.js';

export default function UserManagement() {
  const [search, setSearch] = useState('');

  // Loading, error and refetch state come from the query rather than being
  // reimplemented with four useState flags per page.
  const { data, isPending, isFetching, error, refetch } = useUsers({
    // Administrators are not listed as deletable rows.
    select: (list) => list.filter((user) => user.role !== 'admin'),
  });
  const users = data ?? [];

  const { mutate: removeUser, error: deleteError } = useDeleteUser();

  const deleteUser = (id) => removeUser(id);

  const filteredUsers = users.filter(
    user =>
      user.username?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase())
  );

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
          onChange={e => setSearch(e.target.value)}
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
          {filteredUsers.map((user) => (
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
    </div>
  );
}
