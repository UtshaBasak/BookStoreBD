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
  AdminBookPage,
  AdminUserPage,
  Book,
  BookDetail,
  BookMutationResponse,
  CataloguePage,
  ForYouResponse,
  HomeSections,
  UpdateDiscountRequest,
  CatalogueParams,
  BuyerOrderLine,
  Id,
  ListParams,
  Page,
  MessageResponse,
  OrderDetail,
  OrderLine,
  MarkPayoutPaidRequest,
  PayoutPage,
  ProfileResponse,
  SellerOrderLine,
  ReturnRequest,
  ReturnStatus,
  ReviewSummary,
  FlaggedReview,
  WriteReviewRequest,
  UnreadCountResponse,
  NotificationPage,
  SellerShop,
  CancelOrderRequest,
  SuggestResponse,
  BookRequestStatus,
  AdminMessageRequest,
  AdminMessageResponse,
  AudienceCount,
  MessageAudience,
} from '@shared/api.js';

import { apiFetch, apiUrl } from '../config/api.js';
import { ApiRequestError } from '../utils/apiError.js';
import { getUserEmail } from '../utils/auth.js';

/**
 * Data fetching for the whole app, through React Query.
 *
 * Shared query keys give every page the same cache: two pages asking for the
 * cart make one request and get the same answer.
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
  /** Under `catalogue`, so one invalidation reaches every listing view. */
  adminBooks: (query: string) => ['catalogue', 'admin', query] as const,
  book: (id: Id | undefined) => ['book', id] as const,
  sellerBooks: (email: string | null | undefined) => ['books', 'seller', email] as const,
  /** One entry per distinct search, so turning a page keeps the last one. */
  catalogue: (query: string) => ['catalogue', query] as const,
  featured: (limit: number) => ['catalogue', 'featured', limit] as const,
  /** Under `catalogue`, so a new discount or listing refreshes the shelves too. */
  sections: ['catalogue', 'sections'] as const,
  byIds: (ids: string) => ['catalogue', 'by-ids', ids] as const,
  forYou: (seen: string, who: string | null) => ['catalogue', 'for-you', who, seen] as const,
  cart: ['cart'] as const,
  wishlist: ['wishlist'] as const,
  profile: (email?: string | null) => ['profile', email ?? 'me'] as const,
  /** One entry per distinct search, so turning a page keeps the last one. */
  users: (query: string) => ['users', query] as const,
  /** One entry per distinct search, so turning a page keeps the last one. */
  buyerOrders: (query: string) => ['orders', 'buyer', query] as const,
  sellerOrders: (query: string) => ['orders', 'seller', query] as const,
  allOrders: (query: string) => ['orders', 'all', query] as const,
  order: (orderNumber: string | undefined) => ['order', orderNumber] as const,
  returnRequests: (query: string) => ['returns', query] as const,
  /** Under `orders`, so recording a payment refreshes the seller's view too. */
  payouts: (query: string) => ['orders', 'payouts', query] as const,
  reviews: (id: Id | undefined) => ['reviews', id] as const,
  flaggedReviews: (query: string) => ['reviews', 'flagged', query] as const,
  unreadChats: ['chat', 'unread'] as const,
  notifications: (query: string) => ['notifications', query] as const,
  allReviews: (query: string) => ['reviews', 'all', query] as const,
  shop: (username: string | undefined) => ['shop', username] as const,
  /** Under `catalogue`, so a change to any listing refreshes the suggestions too. */
  suggest: (query: string) => ['catalogue', 'suggest', query] as const,
  bookRequest: (id: Id | undefined) => ['book-request', id] as const,
  myBookRequests: ['book-request', 'mine'] as const,
  audience: (audience: MessageAudience) => ['admin', 'audience', audience] as const,
  chatHistory: ['chat', 'history'] as const,
};

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
/**
 * One page of every listing, for the administrator's table. Searched and paged
 * by the API, so a search covers the whole catalogue.
 */
export const useAdminBooks = (
  params: ListParams,
  options: Partial<QueryOptions<AdminBookPage>> = {}
): UseQueryResult<AdminBookPage> => {
  const search = listSearch(params);

  return useQuery<AdminBookPage, Error, AdminBookPage>({
    queryKey: keys.adminBooks(search),
    queryFn: () => request<AdminBookPage>(`/book/admin${search ? `?${search}` : ''}`),
    placeholderData: keepPreviousData,
    ...options,
  });
};

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
  if (params.deals) query.set('deals', '1');
  if (params.seller) query.set('seller', params.seller);
  if (params.sort) query.set('sort', params.sort);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  return query.toString();
};

/**
 * One page of the catalogue, filtered and ordered by the API.
 *
 * The previous results stay in place while the next ones arrive, so changing
 * a filter or turning a page dims the grid rather than emptying it.
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

/** Every homepage shelf, in one request. */
export const useHomeSections = (): UseQueryResult<HomeSections> =>
  useQuery<HomeSections, Error, HomeSections>({
    queryKey: keys.sections,
    queryFn: () => request<HomeSections>('/filter/sections'),
    staleTime: 60_000,
  });

/** Books by id, in that order: Recently viewed. */
export const useBooksByIds = (ids: readonly string[]): UseQueryResult<Book[]> => {
  const joined = ids.join(',');
  return useQuery<Book[], Error, Book[]>({
    queryKey: keys.byIds(joined),
    queryFn: () => request<Book[]>(`/filter/by-ids?ids=${joined}`),
    enabled: ids.length > 0,
  });
};

/** Top picks: from the account's history when signed in, and what was viewed. */
export const useForYou = (seen: readonly string[]): UseQueryResult<ForYouResponse> => {
  const joined = seen.slice(0, 12).join(',');
  return useQuery<ForYouResponse, Error, ForYouResponse>({
    queryKey: keys.forYou(joined, getUserEmail()),
    queryFn: () => request<ForYouResponse>(`/filter/for-you${joined ? `?seen=${joined}` : ''}`),
    staleTime: 60_000,
  });
};

/** A seller's discount on one of their books. */
export const useUpdateDiscount = (): UseMutationResult<
  BookMutationResponse,
  Error,
  { bookId: Id; discount: UpdateDiscountRequest }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, discount }: { bookId: Id; discount: UpdateDiscountRequest }) =>
      request<BookMutationResponse>(`/book/discount/${bookId}`, json('PUT', discount)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['books', 'seller'] });
      void client.invalidateQueries({ queryKey: ['catalogue'] });
    },
  });
};

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

/**
 * Adds or removes in one hook, since the UI toggles rather than does one.
 * Adding with a quantity puts that many copies in; the server refuses more
 * than are in stock.
 */
export const useToggleCart = (): UseMutationResult<
  Book[],
  Error,
  { bookId: Id; inCart: boolean; quantity?: number }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, inCart, quantity }: { bookId: Id; inCart: boolean; quantity?: number }) =>
      request<Book[]>(
        `/cart/${inCart ? 'remove' : 'add'}/${bookId}`,
        json('POST', !inCart && quantity ? { quantity } : undefined)
      ),
    onSuccess: (books) => client.setQueryData(keys.cart, books),
  });
};

/** How many copies of a book already in the cart. */
export const useSetCartQuantity = (): UseMutationResult<Book[], Error, { bookId: Id; quantity: number }> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, quantity }: { bookId: Id; quantity: number }) =>
      request<Book[]>(`/cart/${bookId}`, json('PATCH', { quantity })),
    onSuccess: (books) => client.setQueryData(keys.cart, books),
    // Refused (not enough stock) or failed: read the cart as it really is.
    onError: () => client.invalidateQueries({ queryKey: keys.cart }),
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
    },
  });
};

/**
 * The seller's answer to one review.
 *
 * Keyed by the review, not the book, and the book's review query is what gets
 * invalidated: the reply is drawn inside that list.
 */
export const useReplyToReview = (
  bookId: Id | undefined
): UseMutationResult<unknown, Error, { reviewId: Id; body: string }> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, body }: { reviewId: Id; body: string }) =>
      request(`/review/${reviewId}/reply`, json('POST', { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reviews(bookId) }),
  });
};

export const useDeleteReply = (
  bookId: Id | undefined
): UseMutationResult<unknown, Error, Id> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: Id) => request(`/review/${reviewId}/reply`, json('DELETE')),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.reviews(bookId) }),
  });
};

/**
 * Reports a review.
 *
 * Nothing about the list changes when it succeeds - reporting hides nothing -
 * so there is no invalidation here; the button says it has been done.
 */
export const useFlagReview = (): UseMutationResult<
  MessageResponse,
  Error,
  { reviewId: Id; reason?: string }
> =>
  useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: Id; reason?: string }) =>
      request<MessageResponse>(`/review/${reviewId}/flag`, json('POST', { reason })),
  });

/** The administrator's moderation queue. */
export const useFlaggedReviews = (
  params: ListParams = {},
  options: Partial<QueryOptions<Page<FlaggedReview>>> = {}
): UseQueryResult<Page<FlaggedReview>> =>
  useQuery(pagedQuery<FlaggedReview>('/review/flagged', keys.flaggedReviews, params, options));

/** Every review, for the administrator's Reviews page. */
export const useAllReviews = (
  params: ListParams = {},
  options: Partial<QueryOptions<Page<FlaggedReview>>> = {}
): UseQueryResult<Page<FlaggedReview>> =>
  useQuery(pagedQuery<FlaggedReview>('/review/all', keys.allReviews, params, options));

/** Clears the reports and leaves the review where it is. */
export const useDismissFlags = (): UseMutationResult<MessageResponse, Error, Id> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: Id) =>
      request<MessageResponse>(`/review/${reviewId}/flags`, json('DELETE')),
    onSuccess: () => client.invalidateQueries({ queryKey: ['reviews', 'flagged'] }),
  });
};

/** Removes somebody else's review. Administrators only; writes an audit row. */
export const useRemoveReview = (): UseMutationResult<
  MessageResponse,
  Error,
  { bookId: Id; reviewerEmail: string }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, reviewerEmail }: { bookId: Id; reviewerEmail: string }) =>
      request<MessageResponse>(
        `/review/${bookId}?email=${encodeURIComponent(reviewerEmail)}`,
        json('DELETE')
      ),
    // Both administrator lists: the reported queue and every review.
    onSuccess: () => client.invalidateQueries({ queryKey: ['reviews'] }),
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
    },
  });
};

// ---------------------------------------------------------------------------
// Orders and returns
//
// Searched and paged by the API, so a search covers every row, not just the
// page on screen.
// ---------------------------------------------------------------------------

/** The three list parameters as a query string, used as the key and the URL. */
export const listSearch = (params: ListParams): string => {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.page && params.page > 1) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  for (const [key, value] of Object.entries(params.filters ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.toString();
};

const pagedQuery = <T>(
  path: string,
  key: (query: string) => readonly unknown[],
  params: ListParams,
  options: Partial<QueryOptions<Page<T>>>
) => {
  const search = listSearch(params);
  return {
    queryKey: key(search),
    queryFn: () => request<Page<T>>(`${path}${search ? `?${search}` : ''}`),
    placeholderData: keepPreviousData,
    ...options,
  };
};
export const useBuyerOrders = (
  params: ListParams = {},
  options: Partial<QueryOptions<Page<BuyerOrderLine>>> = {}
): UseQueryResult<Page<BuyerOrderLine>> =>
  useQuery(pagedQuery<BuyerOrderLine>('/order/buyer', keys.buyerOrders, params, options));

export const useSellerOrders = (
  params: ListParams = {},
  options: Partial<QueryOptions<Page<SellerOrderLine>>> = {}
): UseQueryResult<Page<SellerOrderLine>> =>
  useQuery(pagedQuery<SellerOrderLine>('/order/seller', keys.sellerOrders, params, options));

/** What sellers are owed, or have been paid: one row per seller per order. */
export const usePayouts = (
  params: ListParams & { state: 'due' | 'upcoming' | 'paid' },
  options: Partial<QueryOptions<PayoutPage>> = {}
): UseQueryResult<PayoutPage> => {
  const search = listSearch({ ...params, filters: { state: params.state, ...params.filters } });
  return useQuery({
    queryKey: keys.payouts(search),
    queryFn: () => request<PayoutPage>(`/order/admin/payouts?${search}`),
    placeholderData: keepPreviousData,
    ...options,
  });
};

export const useMarkPayoutPaid = (): UseMutationResult<
  MessageResponse & { amount: number },
  Error,
  MarkPayoutPaidRequest
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkPayoutPaidRequest) =>
      request<MessageResponse & { amount: number }>('/order/admin/payouts/paid', json('POST', body)),
    onSuccess: () => client.invalidateQueries({ queryKey: ['orders'] }),
  });
};

export const useAllOrders = (
  params: ListParams = {},
  options: Partial<QueryOptions<Page<OrderLine>>> = {}
): UseQueryResult<Page<OrderLine>> =>
  useQuery(pagedQuery<OrderLine>('/order/admin/all', keys.allOrders, params, options));

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

/** Calls an order off - the buyer's, a seller's books in it, or an administrator's. */
export const useCancelOrder = (
  orderNumber: string | undefined
): UseMutationResult<MessageResponse, Error, CancelOrderRequest | void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CancelOrderRequest | void) =>
      request<MessageResponse>(`/order/${orderNumber}/cancel`, json('POST', body ?? {})),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.order(orderNumber) });
      void client.invalidateQueries({ queryKey: ['orders'] });
      void client.invalidateQueries({ queryKey: ['catalogue'] });
      void client.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

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

/**
 * One page of the accounts an administrator may act on.
 *
 * The API returns only the table's columns: `profilePicture` is stored as a
 * base64 data URI and would make every page of the list very large.
 */
export const useUsers = (
  params: ListParams = {},
  options: Partial<QueryOptions<AdminUserPage>> = {}
): UseQueryResult<AdminUserPage> => {
  const search = listSearch(params);

  return useQuery<AdminUserPage, Error, AdminUserPage>({
    queryKey: keys.users(search),
    queryFn: () => request<AdminUserPage>(`/user${search ? `?${search}` : ''}`),
    placeholderData: keepPreviousData,
    ...options,
  });
};

export const useDeleteUser = (): UseMutationResult<MessageResponse, Error, Id> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: Id) => request<MessageResponse>(`/user/${id}`, json('DELETE')),
    onSuccess: () => client.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useReturnRequests = (
  params: ListParams = {},
  options: Partial<QueryOptions<Page<ReturnRequest>>> = {}
): UseQueryResult<Page<ReturnRequest>> =>
  useQuery(pagedQuery<ReturnRequest>('/return/requests', keys.returnRequests, params, options));

export const useUpdateReturnStatus = (): UseMutationResult<
  ReturnRequest,
  Error,
  { id: Id; status: ReturnStatus }
> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: Id; status: ReturnStatus }) =>
      request<ReturnRequest>(`/return/requests/${id}`, json('PATCH', { status })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['returns'] }),
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

// ---------------------------------------------------------------------------
// Notifications and shops
// ---------------------------------------------------------------------------

/** A page of the signed-in person's notifications, and how many are unread. */
export const useNotifications = (
  params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {},
  options: Partial<QueryOptions<NotificationPage>> = {}
): UseQueryResult<NotificationPage> => {
  const search = listSearch({ page: params.page, pageSize: params.pageSize, filters: { unreadOnly: params.unreadOnly ? '1' : undefined } });
  return useQuery<NotificationPage, Error, NotificationPage>({
    queryKey: keys.notifications(search),
    queryFn: () => request<NotificationPage>(`/notification${search ? `?${search}` : ''}`),
    enabled: Boolean(getUserEmail()),
    placeholderData: keepPreviousData,
    ...options,
  });
};

/** Marks some notifications read, or with no ids, all of them. */
export const useMarkNotificationsRead = (): UseMutationResult<MessageResponse, Error, Id[] | void> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: Id[] | void) => request<MessageResponse>('/notification/read', json('POST', ids ? { ids } : {})),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
};

/** A seller's shop front. */
export const useShop = (username: string | undefined): UseQueryResult<SellerShop> =>
  useQuery<SellerShop, Error, SellerShop>({
    queryKey: keys.shop(username),
    queryFn: () => request<SellerShop>(`/user/shop/${encodeURIComponent(username ?? '')}`),
    enabled: Boolean(username),
  });

/** What the search box suggests for what has been typed so far. */
export const useSuggest = (query: string): UseQueryResult<SuggestResponse> => {
  const q = query.trim();
  return useQuery<SuggestResponse, Error, SuggestResponse>({
    queryKey: keys.suggest(q.toLowerCase()),
    queryFn: () => request<SuggestResponse>(`/filter/suggest?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
};

/** Whether the person asked for this sold-out book to come back, and how many have. */
export const useBookRequest = (id: Id | undefined, enabled: boolean): UseQueryResult<BookRequestStatus> =>
  useQuery<BookRequestStatus, Error, BookRequestStatus>({
    queryKey: keys.bookRequest(id),
    queryFn: () => request<BookRequestStatus>(`/book/${id}/request`),
    enabled: Boolean(id) && enabled,
  });

/** Asks for a sold-out book (false: not asked yet), or withdraws the request (true). */
export const useToggleBookRequest = (
  id: Id | undefined
): UseMutationResult<BookRequestStatus, Error, boolean> => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (asked: boolean) =>
      request<BookRequestStatus>(`/book/${id}/request`, { method: asked ? 'DELETE' : 'POST' }),
    onSuccess: (status) => client.setQueryData(keys.bookRequest(id), status),
  });
};

/** How many people are waiting for each of the seller's sold-out books, by book id. */
export const useMyBookRequests = (enabled = true): UseQueryResult<Record<string, number>> =>
  useQuery<Record<string, number>, Error, Record<string, number>>({
    queryKey: keys.myBookRequests,
    queryFn: () => request<Record<string, number>>('/book/requests/mine'),
    enabled,
  });

/** How many people a message to this audience would reach. */
export const useAudienceCount = (audience: MessageAudience): UseQueryResult<AudienceCount> =>
  useQuery<AudienceCount, Error, AudienceCount>({
    queryKey: keys.audience(audience),
    queryFn: () => request<AudienceCount>(`/admin/message/audience?audience=${audience}`),
    enabled: audience !== 'users',
  });

/** Sends the administrator's notification or e-mail. */
export const useSendAdminMessage = (): UseMutationResult<AdminMessageResponse, Error, AdminMessageRequest> =>
  useMutation({
    mutationFn: (body: AdminMessageRequest) => request<AdminMessageResponse>('/admin/message', json('POST', body)),
  });

/** Sellers whose name matches a search, for the browse page. */
export const useSellerSearch = (search: string): UseQueryResult<SuggestResponse> => {
  const q = search.trim();
  return useQuery<SuggestResponse, Error, SuggestResponse>({
    queryKey: keys.suggest(`sellers:${q.toLowerCase()}`),
    queryFn: () => request<SuggestResponse>(`/filter/suggest?q=${encodeURIComponent(q)}&books=0&sellers=8`),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
};
