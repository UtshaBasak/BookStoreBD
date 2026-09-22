import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';

import type {
  AdminUser,
  Book,
  BookDetail,
  CataloguePage,
  CatalogueParams,
  BuyerOrderLine,
  Id,
  MessageResponse,
  OrderDetail,
  OrderLine,
  ProfileResponse,
  ReturnRequest,
  ReturnStatus,
  ReviewSummary,
  WriteReviewRequest,
  UnreadCountResponse,
} from '@shared/api.js';

import { apiFetch, apiUrl } from '../config/api.js';
import { ApiRequestError } from '../utils/apiError.js';
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
const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await apiFetch(apiUrl(path), options);

  if (!res.ok) {
    let message = `Request failed with ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      message = body.message || message;
    } catch {
      /* not JSON; keep the status message */
    }
    throw new ApiRequestError(message, res.status);
  }

  return (res.status === 204 ? null : await res.json()) as T;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/**
 * The options a caller may pass through to `useQuery`.
 *
 * The key and the fetcher belong to the hook, so they are not on offer. The
 * second parameter is what `select` produces: a page that only wants a lookup
 * of ids can map the response without every other caller having to know.
 */
export type QueryOptions<TQueryFnData, TData = TQueryFnData> = Omit<
  UseQueryOptions<TQueryFnData, Error, TData>,
  'queryKey' | 'queryFn'
>;

// ---------------------------------------------------------------------------
// Keys, in one place so an invalidation cannot miss a cache by typo
// ---------------------------------------------------------------------------
export const keys = {
  books: ['books'] as const,
  book: (id: Id | undefined) => ['book', id] as const,
  sellerBooks: (email: string | null | undefined) => ['books', 'seller', email] as const,
  /** One entry per distinct search, so turning a page keeps the last one. */
  catalogue: (query: string) => ['catalogue', query] as const,
  featured: (limit: number) => ['catalogue', 'featured', limit] as const,
  cart: ['cart'] as const,
  wishlist: ['wishlist'] as const,
  profile: (email?: string | null) => ['profile', email ?? 'me'] as const,
  users: ['users'] as const,
  buyerOrders: ['orders', 'buyer'] as const,
  sellerOrders: ['orders', 'seller'] as const,
  allOrders: ['orders', 'all'] as const,
  order: (orderNumber: string | undefined) => ['order', orderNumber] as const,
  returnRequests: ['returns'] as const,
  reviews: (id: Id | undefined) => ['reviews', id] as const,
  unreadChats: ['chat', 'unread'] as const,
  chatHistory: ['chat', 'history'] as const,
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export const useBooks = <TData = Book[]>(
  options: Partial<QueryOptions<Book[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<Book[], Error, TData>({
    queryKey: keys.books,
    queryFn: () => request<Book[]>('/book'),
    ...options,
  });

/**
 * The catalogue parameters as a query string.
 *
 * Built in one place because it is both the request and the cache key: two
 * spellings of the same search would otherwise be two cache entries, and a
 * page that asked twice would fetch twice.
 */
export const catalogueSearch = (params: CatalogueParams): string => {
  const query = new URLSearchParams();

  if (params.search) query.set('search', params.search);
  if (params.bookType) query.set('bookType', params.bookType);
  if (params.condition) query.set('condition', params.condition);
  for (const category of params.category ?? []) query.append('category', category);
  if (params.minPrice !== undefined) query.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) query.set('maxPrice', String(params.maxPrice));
  if (params.rating) query.set('rating', String(params.rating));
  if (params.inStock) query.set('inStock', '1');
  if (params.sort) query.set('sort', params.sort);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  return query.toString();
};

/**
 * One page of the catalogue, filtered and ordered by the API.
 *
 * This used to fetch every listing and do all three in the browser. The page
 * kept the previous results while the next ones arrive, so changing a filter
 * or turning a page dims the grid rather than emptying it.
 */
export const useCatalogue = (
  params: CatalogueParams,
  options: Partial<QueryOptions<CataloguePage>> = {}
): UseQueryResult<CataloguePage> => {
  const query = catalogueSearch(params);

  return useQuery<CataloguePage, Error, CataloguePage>({
    queryKey: keys.catalogue(query),
    queryFn: () => request<CataloguePage>(`/filter/booklist${query ? `?${query}` : ''}`),
    placeholderData: keepPreviousData,
    ...options,
  });
};

/** The homepage strip: the newest few, one per title. */
export const useFeatured = (
  limit = 10,
  options: Partial<QueryOptions<Book[]>> = {}
): UseQueryResult<Book[]> =>
  useQuery<Book[], Error, Book[]>({
    queryKey: keys.featured(limit),
    queryFn: () => request<Book[]>(`/filter/featured?limit=${String(limit)}`),
    ...options,
  });

export const useBook = <TData = BookDetail>(
  id: Id | undefined,
  options: Partial<QueryOptions<BookDetail, TData>> = {}
): UseQueryResult<TData> =>
  useQuery<BookDetail, Error, TData>({
    queryKey: keys.book(id),
    queryFn: () => request<BookDetail>(`/book/${id}`),
    enabled: Boolean(id),
    ...options,
  });

export const useSellerBooks = <TData = Book[]>(
  email: string | null | undefined,
  options: Partial<QueryOptions<Book[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<Book[], Error, TData>({
    queryKey: keys.sellerBooks(email),
    queryFn: () => request<Book[]>(`/book/seller/${encodeURIComponent(email ?? '')}`),
    enabled: Boolean(email),
    ...options,
  });

// ---------------------------------------------------------------------------
// Cart and wishlist
// ---------------------------------------------------------------------------
export const useCart = <TData = Book[]>(
  options: Partial<QueryOptions<Book[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<Book[], Error, TData>({
    queryKey: keys.cart,
    queryFn: () => request<Book[]>('/cart'),
    ...options,
  });

export const useWishlist = <TData = Book[]>(
  options: Partial<QueryOptions<Book[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<Book[], Error, TData>({
    queryKey: keys.wishlist,
    queryFn: () => request<Book[]>('/wishlist'),
    ...options,
  });

/** Adds or removes in one hook, since the UI toggles rather than does one. */
export const useToggleCart = (): UseMutationResult<
  Book[],
  Error,
  { bookId: Id; inCart: boolean }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, inCart }: { bookId: Id; inCart: boolean }) =>
      request<Book[]>(`/cart/${inCart ? 'remove' : 'add'}/${bookId}`, json('POST')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.cart }),
  });
};

export const useToggleWishlist = (): UseMutationResult<
  Book[],
  Error,
  { bookId: Id; inWishlist: boolean }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, inWishlist }: { bookId: Id; inWishlist: boolean }) =>
      request<Book[]>(`/wishlist/${inWishlist ? 'remove' : 'add'}/${bookId}`, json('POST')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.wishlist }),
  });
};

export const useClearCart = (): UseMutationResult<MessageResponse, Error, void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request<MessageResponse>('/cart/clear', json('POST')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.cart }),
  });
};

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * A book's reviews, its score, and whether this caller may add to it.
 *
 * Public, so it runs for a signed-out visitor too: the score is mostly for the
 * person who has not signed up yet.
 */
export const useReviews = (id: Id | undefined): UseQueryResult<ReviewSummary> =>
  useQuery<ReviewSummary>({
    queryKey: keys.reviews(id),
    queryFn: () => request<ReviewSummary>(`/review/${id}`),
    enabled: Boolean(id),
  });

/**
 * Writes or replaces the caller's review.
 *
 * Invalidates the catalogue as well as the book: the score is denormalised
 * onto every listing, so a new review changes what the browse page sorts by.
 */
export const useWriteReview = (
  id: Id | undefined
): UseMutationResult<unknown, Error, WriteReviewRequest> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (review: WriteReviewRequest) => request(`/review/${id}`, json('POST', review)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reviews(id) });
      void client.invalidateQueries({ queryKey: keys.book(id) });
      void client.invalidateQueries({ queryKey: ['catalogue'] });
      void client.invalidateQueries({ queryKey: keys.books });
    },
  });
};

export const useDeleteReview = (id: Id | undefined): UseMutationResult<unknown, Error, void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => request(`/review/${id}`, json('DELETE')),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reviews(id) });
      void client.invalidateQueries({ queryKey: keys.book(id) });
      void client.invalidateQueries({ queryKey: ['catalogue'] });
      void client.invalidateQueries({ queryKey: keys.books });
    },
  });
};

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const useBuyerOrders = <TData = BuyerOrderLine[]>(
  options: Partial<QueryOptions<BuyerOrderLine[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<BuyerOrderLine[], Error, TData>({
    queryKey: keys.buyerOrders,
    queryFn: () => request<BuyerOrderLine[]>('/order/buyer'),
    ...options,
  });

export const useSellerOrders = <TData = OrderLine[]>(
  options: Partial<QueryOptions<OrderLine[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<OrderLine[], Error, TData>({
    queryKey: keys.sellerOrders,
    queryFn: () => request<OrderLine[]>('/order/seller'),
    ...options,
  });

export const useAllOrders = <TData = OrderLine[]>(
  options: Partial<QueryOptions<OrderLine[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<OrderLine[], Error, TData>({
    queryKey: keys.allOrders,
    queryFn: () => request<OrderLine[]>('/order/admin/all'),
    ...options,
  });

export const useOrder = <TData = OrderDetail>(
  orderNumber: string | undefined,
  options: Partial<QueryOptions<OrderDetail, TData>> = {}
): UseQueryResult<TData> =>
  useQuery<OrderDetail, Error, TData>({
    queryKey: keys.order(orderNumber),
    queryFn: () => request<OrderDetail>(`/order/${orderNumber}`),
    enabled: Boolean(orderNumber),
    ...options,
  });

export const useUpdateOrderStatus = (
  orderNumber: string | undefined
): UseMutationResult<OrderLine[], Error, string> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      request<OrderLine[]>(`/order/status/${orderNumber}`, json('PATCH', { status })),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.order(orderNumber) });
      client.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

// ---------------------------------------------------------------------------
// Users, profile, returns, chat
// ---------------------------------------------------------------------------
export const useProfile = <TData = ProfileResponse>(
  email?: string | null,
  options: Partial<QueryOptions<ProfileResponse, TData>> = {}
): UseQueryResult<TData> =>
  useQuery<ProfileResponse, Error, TData>({
    queryKey: keys.profile(email),
    queryFn: () =>
      request<ProfileResponse>(
        email ? `/user/profile?email=${encodeURIComponent(email)}` : '/user/profile'
      ),
    ...options,
  });

export const useUsers = <TData = AdminUser[]>(
  options: Partial<QueryOptions<AdminUser[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<AdminUser[], Error, TData>({ queryKey: keys.users, queryFn: () => request<AdminUser[]>('/user'), ...options });

export const useDeleteUser = (): UseMutationResult<MessageResponse, Error, Id> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => request<MessageResponse>(`/user/${id}`, json('DELETE')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.users }),
  });
};

export const useReturnRequests = <TData = ReturnRequest[]>(
  options: Partial<QueryOptions<ReturnRequest[], TData>> = {}
): UseQueryResult<TData> =>
  useQuery<ReturnRequest[], Error, TData>({
    queryKey: keys.returnRequests,
    queryFn: () => request<ReturnRequest[]>('/return/requests'),
    ...options,
  });

export const useUpdateReturnStatus = (): UseMutationResult<
  ReturnRequest,
  Error,
  { id: Id; status: ReturnStatus }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: Id; status: ReturnStatus }) =>
      request<ReturnRequest>(`/return/requests/${id}`, json('PATCH', { status })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.returnRequests }),
  });
};

export const useUnreadChatCount = <TData = UnreadCountResponse>(
  enabled = true,
  options: Partial<QueryOptions<UnreadCountResponse, TData>> = {}
): UseQueryResult<TData> =>
  useQuery<UnreadCountResponse, Error, TData>({
    queryKey: keys.unreadChats,
    // The server takes the account from the token and ignores this segment,
    // but it is part of the route, so the stored e-mail keeps the URL honest.
    queryFn: () =>
      request<UnreadCountResponse>(`/chat/unread/${encodeURIComponent(getUserEmail() ?? 'me')}`),
    enabled,
    ...options,
  });

export { request as apiRequest };
