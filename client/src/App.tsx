import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import HomePage from './pages/Homepage';

/*
 * Every page is its own chunk.
 *
 * The whole application used to arrive in one file, so somebody reading the
 * homepage on a phone downloaded the checkout, the admin panel and the chat
 * before seeing a book. `lazy` splits each route out and Suspense below
 * covers the moment one is fetched.
 *
 * The homepage is the exception: it is the first thing most visitors see, and
 * making them wait for a second request to start it would undo the point.
 */
const SignIn = lazy(() => import('./pages/SignIn'));
const SignUp = lazy(() => import('./pages/SignUp'));
const Payment = lazy(() => import('./pages/Payment'));
const AddBooks = lazy(() => import('./pages/AddBook'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Profile = lazy(() => import('./pages/Profile'));
const UpdateProfile = lazy(() => import('./pages/UpdateProfile'));
const SellerBookList = lazy(() => import('./pages/SellerBookList'));
const Filter = lazy(() => import('./pages/Filter'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Cart = lazy(() => import('./pages/Cart'));
const BuyerBookList = lazy(() => import('./pages/BuyerBookList'));
const BuyerOrderList = lazy(() => import('./pages/buyer/BuyerOrderList'));
const SellerOrderList = lazy(() => import('./pages/SellerOrderList'));
const DescriptionForm = lazy(() => import('./pages/Descriptionform'));
const BookView = lazy(() => import('./pages/BookView'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const OrderTrackingPage = lazy(() => import('./pages/OrderTrackingPage'));
const SellerOrderTrackingPage = lazy(() => import('./pages/SellerOrderTrackingPage'));
const AdminOrderTrackingPage = lazy(() => import('./pages/AdminOrderTrackingPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const About = lazy(() => import('./pages/legal/About'));
const Contact = lazy(() => import('./pages/legal/Contact'));
const Privacy = lazy(() => import('./pages/legal/Privacy'));
const Returns = lazy(() => import('./pages/legal/Returns'));
const Terms = lazy(() => import('./pages/legal/Terms'));

import './styles/orderTracking.css';
import { isAdmin, isAuthenticated } from './utils/auth.js';
import { useSeo } from './hooks/useSeo.js';
import Spinner from './components/Spinner.js';

/** Every guard below takes the subtree it protects and returns it, or a redirect. */
interface GuardProps {
  children: ReactNode;
}

// These guards only decide what to render. They are a convenience, not a
// security boundary: the API re-checks the token and the role on every
// request, so editing localStorage gains an attacker nothing.

// Route guard for the admin panel
function AdminRoute({ children }: GuardProps) {
  useSeo({ noIndex: true });
  if (!isAuthenticated()) return <Navigate to="/sign-in" replace />;
  if (!isAdmin()) return <Navigate to="/" replace />;
  return children;
}

// Route guard for sign-in/up: block if already signed in
function PublicOnlyRoute({ children }: GuardProps) {
  useSeo({ noIndex: true });
  if (!isAuthenticated()) return children;
  return <Navigate to={isAdmin() ? '/admin/users' : '/profile'} replace />;
}

/*
 * Route guard for protected pages.
 *
 * `noIndex` here rather than on each page: everything behind a sign-in answers
 * a crawler with a sign-in form, which is a wasted search result and a bad
 * first impression. One place covers every private route, including any added
 * later. robots.txt says the same thing from the other side.
 */
function ProtectedRoute({ children }: GuardProps) {
  useSeo({ noIndex: true });
  if (!isAuthenticated()) return <Navigate to="/sign-in" replace />;
  return children;
}

/** Shown while a route's chunk is on its way. */
function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <Spinner />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
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
        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
