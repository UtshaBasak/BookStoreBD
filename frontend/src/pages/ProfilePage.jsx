import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

const ProfilePage = () => {
    const navigate = useNavigate();
    const userInfo = useSelector((state) => state.userLogin.userInfo);

    useEffect(() => {
        if (userInfo && userInfo.isAdmin) {
            navigate('/admin/users');
        }
    }, [userInfo, navigate]);

    return (
        <div>
            <h1>Profile Page</h1>
            {/* Add normal profile page rendering here */}
        </div>
    );
};

export default ProfilePage;