import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

const AdminUsersPage = () => {
    const userInfo = useSelector((state) => state.userLogin.userInfo);
    const navigate = useNavigate();

    useEffect(() => {
        if (!userInfo || !userInfo.isAdmin) {
            navigate('/profile');
        }
    }, [userInfo, navigate]);

    return (
        <div>
            <h1>Admin Users</h1>
            {/* Admin panel rendering */}
        </div>
    );
};

export default AdminUsersPage;
