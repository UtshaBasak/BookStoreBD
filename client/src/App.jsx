import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Payment from './pages/Payment';
import AddBooks from './pages/AddBook';
import AdminPanel from './pages/AdminPanel';
import HomePage from './pages/HomePage';
import Profile from './pages/Profile';
import UpdateProfile from './pages/UpdateProfile';
import SellerBookList from './pages/SellerBookList';
import Filter from './pages/Filter';
import Wishlist from './pages/Wishlist';
import Cart from './pages/Cart';
import BuyerBookList from './pages/BuyerBookList';
import BuyerOrderList from './pages/buyer/BuyerOrderList';
import DescriptionForm from './pages/Descriptionform';
import SellerOrderList from './pages/SellerOrderList';
import './styles/orderTracking.css';

// Helper: get current user email from localStorage
const getUserEmail = () => localStorage.getItem('userEmail');
const ADMIN_EMAIL = 'utsha23basak@gmail.com';

// Route guard for admin panel
function AdminRoute({ children }) {
  const userEmail = getUserEmail();
  if (userEmail !== ADMIN_EMAIL) {
    return <Navigate to="/sign-in" replace />;
  }
  return children;
}

// Route guard for sign-in/up: block if already logged in
function PublicOnlyRoute({ children }) {
  const userEmail = getUserEmail();
  if (userEmail) {
    // If admin, redirect to admin panel; else, to profile
    if (userEmail === ADMIN_EMAIL) return <Navigate to="/admin/users" replace />;
    return <Navigate to="/profile" replace />;
  }
  return children;
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/sign-in"
          element={
            <PublicOnlyRoute>
              <SignIn />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/sign-up"
          element={
            <PublicOnlyRoute>
              <SignUp />
            </PublicOnlyRoute>
          }
        />
        <Route path="/payment" element={<Payment />} />
        <Route path="/add-book" element={<AddBooks />} />
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />
        <Route path="/profile" element={<Profile />} />
        <Route path="/update-profile" element={<UpdateProfile />} />
        <Route path="/seller-books" element={<SellerBookList />} />
        <Route path="/wishlist" element={<Wishlist />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/filter" element={<Filter />} />
        <Route path="/buyer-books" element={<BuyerBookList />} />
        <Route path="/buyer/orders" element={<BuyerOrderList />} />
        <Route path="/seller-orders" element={<SellerOrderList />} />
        <Route path="/description-form/:bookId" element={<DescriptionForm />} />
        <Route path="*" element={<h1>404 Not Found</h1>} />
      </Routes>
    </BrowserRouter>
  );
}