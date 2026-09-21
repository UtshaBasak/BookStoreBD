import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Payment from './pages/Payment';
import AddBooks from './pages/AddBook';
import AdminPanel from './pages/AdminPanel';
import HomePage from './pages/Homepage';
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
import About from './pages/legal/About';
import Contact from './pages/legal/Contact';
import Privacy from './pages/legal/Privacy';
import Returns from './pages/legal/Returns';
import Terms from './pages/legal/Terms';
import './styles/orderTracking.css';
import { isAdmin, isAuthenticated } from './utils/auth.js';

/** Every guard below takes the subtree it protects and returns it, or a redirect. */
interface GuardProps {
  children: ReactNode;
}

// These guards only decide what to render. They are a convenience, not a
// security boundary: the API re-checks the token and the role on every
// request, so editing localStorage gains an attacker nothing.

// Route guard for the admin panel
function AdminRoute({ children }: GuardProps) {
  if (!isAuthenticated()) return <Navigate to="/sign-in" replace />;
  if (!isAdmin()) return <Navigate to="/" replace />;
  return children;
}

// Route guard for sign-in/up: block if already signed in
function PublicOnlyRoute({ children }: GuardProps) {
  if (!isAuthenticated()) return children;
  return <Navigate to={isAdmin() ? '/admin/users' : '/profile'} replace />;
}

// Route guard for protected pages
function ProtectedRoute({ children }: GuardProps) {
  if (!isAuthenticated()) return <Navigate to="/sign-in" replace />;
  return children;
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/book" element={<BookView />} />
        {/* A shop that will not show a book without an account cannot sell one.
            Every card on the homepage links here, the API already serves the
            listing to anyone, and the actions that do need an account - cart,
            wishlist, chat - ask for it at the point they are used. */}
        <Route path="/book/:id" element={<BookView />} />
        <Route path="/filter" element={<Filter />} />
        {/* Information and policy pages, reachable without an account - a
            shopper should be able to read the returns policy before signing up. */}
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/returns" element={<Returns />} />
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
