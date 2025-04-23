import React, { useState, useEffect } from 'react';
import './UserManagement.css';

const ADMIN_EMAIL = 'utsha23basak@gmail.com';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:1015/user')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      })
      .then((data) => {
        // Filter out admin user by email
        const filtered = data.filter(user => user.email !== ADMIN_EMAIL);
        setUsers(filtered);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching users:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const deleteUser = async (id) => {
    try {
      const response = await fetch(`http://localhost:1015/user/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete user');
      }

      const data = await response.json();
      console.log('Delete response:', data);
      setUsers(users.filter((user) => user._id !== id));
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user: ' + err.message);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="user-management">
      <header className="user-management-header">
        <h1>User Management</h1>
      </header>
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
              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
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