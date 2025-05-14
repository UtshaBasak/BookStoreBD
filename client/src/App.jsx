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
import SellerOrderList from './pages/SellerOrderList';
import DescriptionForm from './pages/Descriptionform';
import BookView from './pages/BookView';
import ChatPage from './pages/ChatPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import SellerOrderTrackingPage from './pages/SellerOrderTrackingPage';
import AdminOrderTrackingPage from './pages/AdminOrderTrackingPage';
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

// Route guard for protected pages
function ProtectedRoute({ children }) {
  const userEmail = getUserEmail();
  if (!userEmail) {
    return <Navigate to="/sign-in" replace />;
  }
  return children;
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/book" element={<BookView />} />
        <Route path="/filter" element={<Filter />} />
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
        {/* Protected routes */}
        <Route
          path="/payment"
          element={
            <ProtectedRoute>
              <Payment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-book"
          element={
            <ProtectedRoute>
              <AddBooks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/*"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/update-profile"
          element={
            <ProtectedRoute>
              <UpdateProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/seller-books"
          element={
            <ProtectedRoute>
              <SellerBookList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/wishlist"
          element={
            <ProtectedRoute>
              <Wishlist />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cart"
          element={
            <ProtectedRoute>
              <Cart />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/order-tracking/:orderNumber"
          element={
            <ProtectedRoute>
              <OrderTrackingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/seller/order-tracking/:orderNumber"
          element={
            <ProtectedRoute>
              <SellerOrderTrackingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/order-tracking/:orderNumber"
          element={
            <ProtectedRoute>
              <AdminOrderTrackingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/book/:id"
          element={
            <ProtectedRoute>
              <BookView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/buyer-books"
          element={
            <ProtectedRoute>
              <BuyerBookList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/buyer/orders"
          element={
            <ProtectedRoute>
              <BuyerOrderList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/seller-orders"
          element={
            <ProtectedRoute>
              <SellerOrderList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/description-form/:bookId"
          element={
            <ProtectedRoute>
              <DescriptionForm />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<h1>404 Not Found</h1>} />
      </Routes>
    </BrowserRouter>
  );
}
