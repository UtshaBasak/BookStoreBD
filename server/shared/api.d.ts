/**
 * The HTTP contract between the API and the browser.
 *
 * Both packages compile against this one file - the server directly, the
 * client through the `@shared/*` path in its tsconfig - so a response shape
 * cannot drift on one side without the other failing to type-check.
 *
 * It lives with the API because the API is what decides these shapes, and
 * because the server's build has to be able to see it.
 *
 * Deliberately a declaration file: types and nothing else, so it disappears
 * entirely at compile time. Neither package gains a runtime dependency on the
 * other, and nothing has to be bundled or published to share it.
 *
 * These are *wire* types, not database types. What MongoDB stores as an
 * ObjectId or a Date arrives here as a string, because that is what
 * JSON.stringify produced at the other end.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A 24-character hex ObjectId, as serialised into JSON. */
export type Id = string;

/** An ISO-8601 timestamp, as serialised into JSON. */
export type IsoDate = string;

export type UserRole = 'user' | 'admin';
export type BookType = 'new' | 'old';
export type ReturnStatus = 'pending' | 'approved' | 'rejected';

/** How the catalogue may be ordered. */
export type CatalogueSort =
  | 'relevant'
  | 'newest'
  | 'rated'
  | 'priceLowHigh'
  | 'priceHighLow'
  | 'dealPercent'
  | 'dealAmount';

/** How a seller gives a discount: a share of the price, or taka off it. */
export type DiscountType = 'percent' | 'amount';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** Dotted path to the offending value, e.g. body.email. */
  path: string;
  message: string;
}

/** Every non-2xx response carries at least a message. */
export interface ApiError {
  message: string;
  success?: false;
  statusCode?: number;
  /** Present only on a 400 from the validation middleware. */
  errors?: ValidationIssue[];
  /** A machine-readable reason, where the page can offer a way out of it. */
  code?: 'payout-number-required';
}

/** A plain acknowledgement, such as the answer to a delete. */
export interface MessageResponse {
  message: string;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** What a token is allowed to tell the client about its owner. */
export interface SessionUser {
  id: Id;
  username: string;
  email: string;
  role: UserRole;
}

/**
 * Returned by sign-in, sign-up and refresh.
 *
 * The refresh token is not here on purpose: it travels only in an httpOnly
 * cookie, so page JavaScript can never read it.
 */
export interface SessionResponse {
  token: string;
  user: SessionUser;
}

export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * POST /auth/signin with two-step sign-in on: the password was right, and a
 * code is on its way. POST /auth/signin/verify `{ email, code }` completes it.
 */
export interface TwoFactorChallenge {
  twoFactor: true;
  /** The address the code went to, partly hidden. */
  sentTo: string;
  message: string;
}

export type SignInResponse = SessionResponse | TwoFactorChallenge;

/** PUT /user/me/two-factor. Turning it off asks for the password. */
export interface TwoFactorRequest {
  enabled: boolean;
  password?: string;
}

export interface SignUpRequest {
  username: string;
  email: string;
  password: string;
  otp?: string;
}

export interface SendOtpRequest {
  email: string;
  username?: string;
  purpose?: 'register' | 'reset';
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface Book {
  _id: Id;
  title: string;
  author: string;
  publisher: string;
  country: string;
  language: string;
  isbn: string;
  /** Optional: a seller need not know the page count. */
  pages?: number;
  price: number;
  desc: string;
  category: string[];
  bookType: BookType;
  condition?: string;
  conditionDetails?: string;
  /**
   * A Cloudinary delivery URL, or a base64 data URI for records that predate
   * image hosting. List endpoints return only the first; the detail endpoint
   * returns the whole gallery.
   */
  images: string[];
  /** Parallel to images, and populated only for hosted images. */
  imagePublicIds?: string[];
  sellerEmail: string;
  stock: number;
  createdAt?: IsoDate;
  /**
   * The score, held on the listing so the catalogue can sort and filter on it
   * without a join. Zero and 0 until somebody who bought the book says
   * otherwise.
   */
  ratingAverage?: number;
  ratingCount?: number;
  /** The seller's discount, as they gave it; null when there is none. */
  discountType?: DiscountType | null;
  discountValue?: number;
  /**
   * What a copy costs the buyer: `price` less the discount. The price the
   * catalogue filters and sorts by, and the one checkout charges. Absent only
   * on records from before discounts, where it equals `price`.
   */
  salePrice?: number;
  /** The discount as a share of the price, whichever way it was given. */
  discountPercent?: number;
  /** The discount in taka. */
  discountAmount?: number;
  /** In the cart: how many copies. */
  cartQuantity?: number;
  /** In the cart: the quantity was lowered to what is left in stock. */
  cartAdjusted?: boolean;
}

/** GET /filter/sections: every shelf on the homepage, in one response. */
export interface HomeSections {
  /** Discounted and in stock, the biggest share off first. */
  deals: Book[];
  /** Ordered and saved most in the last fortnight. */
  trending: Book[];
  /** Saved to wishlists most, then ordered. */
  popular: Book[];
  /** The most copies sold. */
  bestsellers: Book[];
  topRated: Book[];
  /** In stock at 300 Tk or less. */
  budget: Book[];
  /** A random handful, different on each visit. */
  discover: Book[];
  writers: PopularWriter[];
  /** Every category that has a listing, with how many. */
  categories: { name: string; books: number }[];
}

export interface PopularWriter {
  name: string;
  books: number;
  sold: number;
}

/** A seller found by name: in the search box's suggestions and on the browse page. */
export interface SellerHit {
  username: string;
  avatar: string | null;
  /** How many books they have listed. */
  books: number;
}

/** One book the search box suggests. */
export interface SuggestBook {
  _id: Id;
  title: string;
  author: string;
  cover: string | null;
  price: number;
  salePrice: number;
  discountPercent: number;
  inStock: boolean;
}

/** GET /filter/suggest?q= */
export interface SuggestResponse {
  books: SuggestBook[];
  sellers: SellerHit[];
}

/** GET and POST /book/:id/request - asking for a sold-out book to come back. */
export interface BookRequestStatus {
  /** Whether the person asking has an open request for it. */
  requested: boolean;
  /** Open requests from everyone, for the seller. */
  count: number;
}

/** GET /user/shop/:username - a seller's shop front. */
export interface SellerShop {
  /** The seller's account id: what their ratings are filed under. */
  id: Id;
  username: string;
  email: string;
  profilePicture: string | null;
  sellerBanner: string | null;
  joinedAt: IsoDate | null;
  books: number;
  inStock: number;
  /** Copies sold, not counting cancelled or returned ones. */
  sold: number;
  /** Across every rated book of theirs, weighted by how many reviews each has. */
  ratingAverage: number;
  ratingCount: number;
  /** Buyers' ratings of the seller themself. */
  sellerRating: SellerRating;
}

/** A seller's score from the buyers who have rated them. */
export interface SellerRating {
  average: number;
  count: number;
}

/** GET /filter/for-you. `personal` is false when there was nothing to go on. */
export interface ForYouResponse {
  items: Book[];
  personal: boolean;
}

/** PUT /book/discount/:id */
export type UpdateDiscountRequest = { type: 'none' } | { type: DiscountType; value: number };

/** One verified buyer's verdict. */
export interface Review {
  _id: Id;
  book: Id;
  reviewerEmail: string;
  reviewerName: string;
  rating: number;
  title?: string;
  body?: string;
  orderNumber?: string;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
  /** The seller's answer, when they have written one. */
  reply?: ReviewReply;
  /** How many people have reported it. Zero for everything a shopper sees. */
  flagCount?: number;
}

/** One answer from the seller of the book, under one review. */
export interface ReviewReply {
  body: string;
  byEmail: string;
  byName: string;
  at: IsoDate;
}

/** A row of the administrator's moderation queue. */
export interface FlaggedReview extends Review {
  bookTitle: string;
  /** What the reporters said, for those who gave a reason. */
  reasons: string[];
}

/** One buyer's rating of a seller, under /seller-review. Shaped like a book review. */
export interface SellerReview extends Omit<Review, 'book'> {
  /** The seller's account id. */
  seller: Id;
  sellerEmail: string;
}

/** A row of the administrator's lists of seller ratings. */
export interface FlaggedSellerReview extends SellerReview {
  /** The seller's username, for the link to their shop. */
  sellerName: string;
  reasons: string[];
}

/** GET /seller-review/:id - a shop's ratings section, on the same terms as a book's. */
export interface SellerReviewSummary extends Omit<ReviewSummary, 'reviews' | 'mine'> {
  reviews: SellerReview[];
  mine: SellerReview | null;
}

/** Why a caller may not write a review, when they may not. */
export type ReviewBlockedReason = 'sign-in' | 'own-listing' | 'own-shop' | 'not-purchased';

/** GET /review/:id - everything a book's review section needs. */
export interface ReviewSummary {
  average: number;
  count: number;
  /** How many gave one star, two, and so on. Index 0 is one star. */
  distribution: number[];
  reviews: Review[];
  /** The caller's own review, when they have written one. */
  mine: Review | null;
  canReview: boolean;
  reason: ReviewBlockedReason | null;
  /** Whether the caller is the seller, and so may answer the reviews. */
  isSeller: boolean;
}

/** POST /review/:id/reply */
export interface ReplyToReviewRequest {
  body: string;
}

/** POST /review/:id/flag */
export interface FlagReviewRequest {
  reason?: string;
}

/** POST /review/:id */
export interface WriteReviewRequest {
  rating: number;
  title?: string;
  body?: string;
}

/** GET /book/:id - the book itself plus a few others like it. */
export interface BookDetail extends Book {
  relatedBooks: Book[];
}

/**
 * GET /filter/booklist - one page of the catalogue.
 *
 * Every field is named and typed here rather than passed as a key/value pair,
 * so no request can choose which document path is queried.
 */
export interface CatalogueParams {
  search?: string;
  bookType?: BookType;
  condition?: string;
  category?: string[];
  minPrice?: number;
  maxPrice?: number;
  /** A floor, not a match: 4 means "four stars and up". */
  rating?: number;
  inStock?: boolean;
  /** Only books with a discount: Quick deals. */
  deals?: boolean;
  /** One seller's books, by username: their shop. */
  seller?: string;
  sort?: CatalogueSort;
  page?: number;
  pageSize?: number;
}

/** What that request answers with: the page, and enough to draw a pager. */
export interface CataloguePage {
  items: Book[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * A row of the administrator's table.
 *
 * The seller's name is resolved for the page being sent. The table used to
 * download every user account to turn an e-mail into a name in the browser.
 */
export interface AdminBookRow extends Book {
  sellerName: string;
}

/** GET /book/admin - one page of every listing, seller included. */
export interface AdminBookPage {
  items: AdminBookRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface UpdateStockRequest {
  stock: number;
}

export interface UpdatePriceRequest {
  price: number;
}

/** PUT /book/update-stock/:id and /update-price/:id. */
export interface BookMutationResponse {
  message: string;
  book: Book;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * One book within an order.
 *
 * An order is stored as one row per book sharing an orderNumber, rather than
 * as a parent document with children, so the order-level fields repeat on
 * every line.
 */
/** One page of a table, with enough to draw a pager. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** What the three order tables and the returns table ask for. */
export interface ListParams {
  search?: string;
  page?: number;
  pageSize?: number;
  /** Anything else a list takes - a status, a sort, a date - sent as it is; empty values are left out. */
  filters?: Record<string, string | number | undefined>;
}

export interface OrderLine {
  _id: Id;
  orderNumber: string;
  status: string;
  /** Set by the server when the status becomes 'Delivered'. */
  deliveredAt?: IsoDate | null;
  buyerEmail: string;
  sellerEmail: string;
  bookId: Id;
  title?: string;
  author?: string;
  category?: string[];
  bookType?: string;
  condition?: string;
  pages?: number;
  /** What one copy cost: the sale price, when the book had a discount. */
  price?: number;
  /** The listed price when it was bought, for what the discount saved. */
  listPrice?: number;
  quantity?: number;
  paymentMethod?: string;
  contactName?: string;
  contactPhone?: string;
  deliveryDivision?: string;
  deliveryDistrict?: string;
  deliveryAddress?: string;
  shippingCharge?: number;
  discount?: number;
  promo?: string;
  promoApplied?: boolean;
  isReturned?: number;
  /** The buyer's note to the seller, given at checkout. */
  buyerNote?: string;
  /** When, by whom and why a cancelled line was called off. */
  cancelledAt?: IsoDate | null;
  cancelledBy?: 'buyer' | 'seller' | 'admin' | '';
  cancelReason?: string;
  defectDescription?: string;
  createdAt?: IsoDate;
}

/** GET /order/buyer adds the totals for the order each line belongs to. */
export interface BuyerOrderLine extends OrderLine {
  booksTotal: number;
  shippingCost: number;
  discount: number;
  totalCost: number;
  /**
   * Whether this book has a return in progress, and how far it has got.
   *
   * Sent with the line rather than fetched separately: the buyer's list used
   * to download every return request the account had ever made, photographs
   * and all, to work this out in the browser.
   */
  returnStatus: ReturnStatus | null;
  /**
   * The last moment a return can be requested, or null when it cannot be:
   * not delivered yet, or the window has closed. Decided by the server, which
   * is also where it is enforced.
   */
  returnableUntil: IsoDate | null;
}

/** GET /order/:orderNumber - the whole order, summarised. */
export interface OrderDetail extends OrderLine {
  books: OrderLine[];
  booksTotal: number;
  shippingCost: number;
  totalCost: number;
  /** Whether the person looking may cancel it now (config/commerce.ts has the rules). */
  canCancel: boolean;
  /** The statuses they may move it to from here; empty for a buyer. */
  statusOptions: string[];
}

/** POST /order/:orderNumber/cancel */
export interface CancelOrderRequest {
  reason?: string;
}

export interface OrderItemRequest {
  bookId: Id;
  quantity: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
  // No delivery charge and no discount: the server prices delivery from
  // `deliveryDistrict`, and a promo from its code.
  promo?: string;
  paymentMethod?: string;
  contactName?: string;
  contactPhone?: string;
  deliveryDivision?: string;
  deliveryDistrict?: string;
  deliveryAddress?: string;
  /** A short note from the buyer to the seller, such as a delivery time. */
  buyerNote?: string;
}

/** A line that could not be fulfilled because stock ran out first. */
export interface UnavailableItem {
  bookId: Id;
  title?: string;
  available: number;
}

export interface CreateOrderResponse {
  message: string;
  orderNumber: string;
  /** What the server charged for delivery, in taka. */
  shippingCharge: number;
  /** What the promo code took off, in taka; 0 without one. */
  discount: number;
  /** Why a code given at checkout was not applied, when it was not. */
  promoMessage?: string;
  unavailable: UnavailableItem[];
}

export interface CheckPromoRequest {
  code: string;
  booksTotal: number;
}

export interface CheckPromoResponse {
  code: string;
  description: string;
  /** Taka off the books. */
  discount: number;
  /** Whether the code waives the delivery charge. */
  freeDelivery: boolean;
}

/**
 * Where a seller's money for one order line has got to. A line is paid out
 * once its return window has closed with no return pending or approved.
 */
export type PayoutState =
  | 'awaiting-delivery'
  | 'in-return-window'
  | 'return-in-progress'
  | 'returned'
  | 'due'
  | 'paid';

/** GET /order/seller adds where the payout for each line stands. */
export interface SellerOrderLine extends OrderLine {
  payoutState: PayoutState;
  /** When the return window closes and the line becomes payable, once delivered. */
  payableFrom: IsoDate | null;
  sellerPaidAt?: IsoDate | null;
  sellerPayoutRef?: string;
}

/** One seller's books in one order, owed or paid. */
export interface PayoutRow {
  orderNumber: string;
  sellerEmail: string;
  sellerName: string | null;
  /** Null when the seller has not given one - they cannot be paid until they do. */
  bkashMerchant: string | null;
  titles: string[];
  booksTotal: number;
  fee: number;
  payout: number;
  deliveredAt: IsoDate | null;
  /** When the buyer's return window closes and the sale can be paid. */
  payableFrom: IsoDate | null;
  paidAt: IsoDate | null;
  /** The bKash transaction ID recorded with the payment. */
  reference: string | null;
}

export type PayoutPage = Page<PayoutRow>;

export interface MarkPayoutPaidRequest {
  orderNumber: string;
  sellerEmail: string;
  reference: string;
}

export interface UpdateOrderStatusRequest {
  status: string;
}

// ---------------------------------------------------------------------------
// Purchases and returns
// ---------------------------------------------------------------------------

export interface Purchase {
  _id: Id;
  /** Populated with the book itself by GET /purchase. */
  bookId: Book | Id | null;
  userEmail: string;
  date?: IsoDate;
  isReturned?: boolean;
}

export interface CreatePurchaseRequest {
  bookId: Id;
  quantity?: number;
}

export interface ReturnRequest {
  _id: Id;
  /** The order line returned. Null on requests made before they named one. */
  orderId?: Id | null;
  orderNumber?: string;
  bookId: Id;
  bookTitle: string;
  userEmail: string;
  sellerEmail: string;
  defectDescription: string;
  /** The bKash number an approved refund is paid to, as 01XXXXXXXXX. */
  refundBkash?: string;
  /**
   * One address per photograph: `/api/return/requests/:id/image/:n`.
   *
   * They are stored on the document as base64, so listing them inline meant
   * the table downloaded every picture anybody had uploaded.
   */
  images?: string[];
  status: ReturnStatus;
  createdAt?: IsoDate;
}

export interface CreateReturnRequest {
  /** The order line, not the book: the same title can be bought twice. */
  orderId: Id;
  defectDescription: string;
  refundBkash: string;
}

export interface UpdateReturnStatusRequest {
  status: ReturnStatus;
}

export interface CreateReturnResponse {
  message: string;
  returnId: Id;
  /** One per book, when a whole order was returned. */
  returnIds?: Id[];
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** What anyone may see about the seller named on a listing. */
export interface PublicProfile {
  username: string;
  email: string;
  profilePicture: string | null;
  /**
   * The two banner pictures across the top of a profile, one for each way of
   * using the shop, as addresses to fetch. Null when not set.
   */
  buyerBanner: string | null;
  sellerBanner: string | null;
  /** Buyers' ratings of this person as a seller. */
  sellerRating?: SellerRating;
}

/**
 * Everything the owner - or an administrator - may see.
 *
 * The split is deliberate: without it, any address, phone number and date of
 * birth in the database could be read by e-mail address alone.
 */
export interface OwnProfile extends PublicProfile {
  // Nullable as well as optional: a field the owner has cleared is stored as
  // null, and that is what comes back over the wire.
  address?: string | null;
  phone?: string | null;
  /** Where a seller's sales are paid, as 01XXXXXXXXX. Needed before listing. */
  bkashMerchant?: string | null;
  dateOfBirth?: IsoDate | null;
  gender?: 'male' | 'female' | null;
  role: UserRole;
  /** Whether signing in also asks for a code sent by e-mail. */
  twoFactor?: boolean;
}

export type ProfileResponse = PublicProfile | OwnProfile;

export interface UpdateProfileRequest {
  username?: string;
  password?: string;
  address?: string;
  phone?: string;
  /** Empty clears it. */
  bkashMerchant?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female';
  profilePicture?: string;
}

/** A full user record, as the administrator list returns it. */
/** GET /user - one page of the accounts an administrator may act on. */
export interface AdminUserPage {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AdminUser {
  _id: Id;
  username: string;
  email: string;
  role: UserRole;
  dateOfBirth?: IsoDate;
  gender?: 'male' | 'female';
  address?: string;
  phone?: string;
  profilePicture?: string;
  createdAt?: IsoDate;
  updatedAt?: IsoDate;
}

export interface UpdateProfileResponse {
  message: string;
  user: AdminUser;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  _id: Id;
  sender: string;
  receiver: string;
  message: string;
  /**
   * The attachment, if any: an address to fetch it from.
   */
  image?: string | null;
  timestamp: IsoDate;
  read?: boolean;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  page: number;
  limit: number;
}

/** One row of the conversation list. */
export interface ChatSummary {
  email: string;
  username: string;
  profilePicture?: string;
  lastMessage: string;
  lastMessageTime: IsoDate;
  unreadCount: number;
}

export interface SendChatRequest {
  receiver: string;
  message?: string;
}

export interface MarkReadRequest {
  sender: string;
}

export interface DeleteConversationRequest {
  user1: string;
  user2: string;
}

export interface UnreadCountResponse {
  count: number;
}

// ---------------------------------------------------------------------------
// Image hosting
// ---------------------------------------------------------------------------

/**
 * GET /upload/signature - everything the browser needs to upload straight to
 * Cloudinary. The bytes never pass through the API.
 */
export interface UploadSignature {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  uploadUrl: string;
}

/** Returned with 503 when no Cloudinary credentials are configured. */
export interface UploadUnavailable {
  message: string;
  fallback: 'inline';
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok';
  uptime: number;
  /** The deployed commit, when the host reports one. */
  commit: string | null;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'order-placed'
  | 'order-received'
  | 'order-status'
  | 'order-cancelled'
  | 'stock'
  | 'return-requested'
  | 'return-decided'
  | 'payout'
  | 'review'
  | 'review-reply'
  | 'review-reported'
  | 'seller-review'
  | 'seller-review-reply'
  | 'seller-review-reported'
  | 'deal'
  | 'price-drop'
  | 'book-request'
  | 'back-in-stock'
  | 'wanted-found'
  | 'invite-joined'
  | 'welcome'
  | 'shop-message'
  | 'announcement';

/** What people can choose to hear about. See server/utils/notificationPrefs.ts. */
export type NotificationCategory =
  | 'orders'
  | 'returns'
  | 'payouts'
  | 'reviews'
  | 'stock'
  | 'deals'
  | 'wanted'
  | 'community'
  | 'announcements'
  | 'moderation';

/** On or off for each category and channel. A category left out is on. */
export type NotificationPrefs = Partial<Record<NotificationCategory, { inApp: boolean; email: boolean }>>;

/** GET /user/me/notifications - the choices, with what each one covers. */
export interface NotificationSettings {
  categories: {
    id: NotificationCategory;
    label: string;
    description: string;
    /** Whether this category is ever e-mailed, so whether there is an e-mail switch. */
    emailAvailable: boolean;
    inApp: boolean;
    email: boolean;
  }[];
}

/** PUT /user/me/notifications */
export interface UpdateNotificationSettingsRequest {
  prefs: NotificationPrefs;
}

/** POST /auth/password-check */
export interface PasswordCheckRequest {
  password: string;
  email?: string;
  username?: string;
}

export interface PasswordCheckResponse {
  ok: boolean;
  /** The rules it breaks, by id (client/src/utils/passwordPolicy.ts). */
  problems: string[];
  /** Why it would be refused, including a known breach; '' when it is fine. */
  message: string;
}

/** Who an administrator's message goes to. */
export type MessageAudience = 'users' | 'buyers' | 'sellers' | 'all';
export type MessageChannel = 'notification' | 'email' | 'both';

/** POST /admin/message */
export interface AdminMessageRequest {
  channel: MessageChannel;
  audience: MessageAudience;
  /** With audience 'users': who, by e-mail address. */
  emails?: string[];
  title: string;
  body: string;
  /** A page inside the site to open, such as /filter?deals=1. */
  link?: string;
}

export interface AdminMessageResponse {
  message: string;
  recipients: number;
  notified: number;
  emailed: number;
  /** E-mails that could not be sent. */
  failed: number;
}

/** GET /admin/message/audience - how many a message would reach. */
export interface AudienceCount {
  audience: MessageAudience;
  recipients: number;
}

/** One thing somebody was told about, for the bell. */
export interface NotificationItem {
  _id: Id;
  type: NotificationType;
  title: string;
  body: string;
  /** A path inside the site; empty when there is nowhere to go. */
  link: string;
  read: boolean;
  createdAt: IsoDate;
}

/** GET /notification */
export interface NotificationPage {
  items: NotificationItem[];
  /** Across all of them, not only this page: the number on the bell. */
  unread: number;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
