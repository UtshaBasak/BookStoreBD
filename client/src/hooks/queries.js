import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { apiFetch, apiUrl } from '../config/api.js';
import { getUserEmail } from '../utils/auth.js';

/**
 * Data fetching for the whole app.
 *
 * Every page used to run its own `useEffect` → `fetch` → `setState`, which
 * meant no caching, no shared state between pages, and a loading flag
 * reimplemented each time. Sharing the query keys below means two pages asking
 * for the cart get one request and the same answer.
 */

/** Throws an error carrying the status, so `retry` can act on it. */
const request = async (path, options) => {
  const res = await apiFetch(apiUrl(path), options);

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      /* not JSON; keep the status message */
    }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return res.status === 204 ? null : res.json();
};

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

// ---------------------------------------------------------------------------
// Keys, in one place so an invalidation cannot miss a cache by typo
// ---------------------------------------------------------------------------
export const keys = {
  books: ['books'],
  book: (id) => ['book', id],
  sellerBooks: (email) => ['books', 'seller', email],
  catalogue: ['catalogue'],
  cart: ['cart'],
  wishlist: ['wishlist'],
  profile: (email) => ['profile', email ?? 'me'],
  users: ['users'],
  buyerOrders: ['orders', 'buyer'],
  sellerOrders: ['orders', 'seller'],
  allOrders: ['orders', 'all'],
  order: (orderNumber) => ['order', orderNumber],
  returnRequests: ['returns'],
  unreadChats: ['chat', 'unread'],
  chatHistory: ['chat', 'history'],
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export const useBooks = (options = {}) =>
  useQuery({ queryKey: keys.books, queryFn: () => request('/book'), ...options });

export const useCatalogue = (options = {}) =>
  useQuery({ queryKey: keys.catalogue, queryFn: () => request('/filter/booklist'), ...options });

export const useBook = (id, options = {}) =>
  useQuery({
    queryKey: keys.book(id),
    queryFn: () => request(`/book/${id}`),
    enabled: Boolean(id),
    ...options,
  });

export const useSellerBooks = (email, options = {}) =>
  useQuery({
    queryKey: keys.sellerBooks(email),
    queryFn: () => request(`/book/seller/${encodeURIComponent(email)}`),
    enabled: Boolean(email),
    ...options,
  });

// ---------------------------------------------------------------------------
// Cart and wishlist
// ---------------------------------------------------------------------------
export const useCart = (options = {}) =>
  useQuery({ queryKey: keys.cart, queryFn: () => request('/cart'), ...options });

export const useWishlist = (options = {}) =>
  useQuery({ queryKey: keys.wishlist, queryFn: () => request('/wishlist'), ...options });

/** Adds or removes in one hook, since the UI toggles rather than does one. */
export const useToggleCart = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, inCart }) =>
      request(`/cart/${inCart ? 'remove' : 'add'}/${bookId}`, json('POST')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.cart }),
  });
};

export const useToggleWishlist = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, inWishlist }) =>
      request(`/wishlist/${inWishlist ? 'remove' : 'add'}/${bookId}`, json('POST')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.wishlist }),
  });
};

export const useClearCart = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request('/cart/clear', json('POST')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.cart }),
  });
};

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const useBuyerOrders = (options = {}) =>
  useQuery({ queryKey: keys.buyerOrders, queryFn: () => request('/order/buyer'), ...options });

export const useSellerOrders = (options = {}) =>
  useQuery({ queryKey: keys.sellerOrders, queryFn: () => request('/order/seller'), ...options });

export const useAllOrders = (options = {}) =>
  useQuery({ queryKey: keys.allOrders, queryFn: () => request('/order/admin/all'), ...options });

export const useOrder = (orderNumber, options = {}) =>
  useQuery({
    queryKey: keys.order(orderNumber),
    queryFn: () => request(`/order/${orderNumber}`),
    enabled: Boolean(orderNumber),
    ...options,
  });

export const useUpdateOrderStatus = (orderNumber) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status) => request(`/order/status/${orderNumber}`, json('PATCH', { status })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.order(orderNumber) });
      client.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

// ---------------------------------------------------------------------------
// Users, profile, returns, chat
// ---------------------------------------------------------------------------
export const useProfile = (email, options = {}) =>
  useQuery({
    queryKey: keys.profile(email),
    queryFn: () => request(email ? `/user/profile?email=${encodeURIComponent(email)}` : '/user/profile'),
    ...options,
  });

export const useUsers = (options = {}) =>
  useQuery({ queryKey: keys.users, queryFn: () => request('/user'), ...options });

export const useDeleteUser = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id) => request(`/user/${id}`, json('DELETE')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.users }),
  });
};

export const useReturnRequests = (options = {}) =>
  useQuery({
    queryKey: keys.returnRequests,
    queryFn: () => request('/return/requests'),
    ...options,
  });

export const useUpdateReturnStatus = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => request(`/return/requests/${id}`, json('PATCH', { status })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.returnRequests }),
  });
};

export const useUnreadChatCount = (enabled = true, options = {}) =>
  useQuery({
    queryKey: keys.unreadChats,
    // The server takes the account from the token and ignores this segment,
    // but it is part of the route, so the stored e-mail keeps the URL honest.
    queryFn: () => request(`/chat/unread/${encodeURIComponent(getUserEmail() ?? 'me')}`),
    enabled,
    ...options,
  });

export { request as apiRequest };
