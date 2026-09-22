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
export type CatalogueSort = 'newest' | 'rated' | 'priceLowHigh' | 'priceHighLow';

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
}

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
}

/** Why a caller may not write a review, when they may not. */
export type ReviewBlockedReason = 'sign-in' | 'own-listing' | 'not-purchased';

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
export interface OrderLine {
  _id: Id;
  orderNumber: string;
  status: string;
  buyerEmail: string;
  sellerEmail: string;
  bookId: Id;
  title?: string;
  author?: string;
  category?: string[];
  bookType?: string;
  condition?: string;
  pages?: number;
  price?: number;
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
  defectDescription?: string;
  createdAt?: IsoDate;
}

/** GET /order/buyer adds the totals for the order each line belongs to. */
export interface BuyerOrderLine extends OrderLine {
  booksTotal: number;
  shippingCost: number;
  discount: number;
  totalCost: number;
}

/** GET /order/:orderNumber - the whole order, summarised. */
export interface OrderDetail extends OrderLine {
  books: OrderLine[];
  booksTotal: number;
  shippingCost: number;
  totalCost: number;
}

export interface OrderItemRequest {
  bookId: Id;
  quantity: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
  shippingCharge?: number;
  discount?: number;
  promo?: string;
  promoApplied?: boolean;
  paymentMethod?: string;
  contactName?: string;
  contactPhone?: string;
  deliveryDivision?: string;
  deliveryDistrict?: string;
  deliveryAddress?: string;
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
  unavailable: UnavailableItem[];
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
  bookId: Id;
  bookTitle: string;
  userEmail: string;
  sellerEmail: string;
  defectDescription: string;
  images?: string[];
  status: ReturnStatus;
  createdAt?: IsoDate;
}

export interface CreateReturnRequest {
  bookId: Id;
  defectDescription: string;
}

export interface UpdateReturnStatusRequest {
  status: ReturnStatus;
}

export interface CreateReturnResponse {
  message: string;
  returnId: Id;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/** What anyone may see about the seller named on a listing. */
export interface PublicProfile {
  username: string;
  email: string;
  profilePicture: string | null;
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
  dateOfBirth?: IsoDate | null;
  gender?: 'male' | 'female' | null;
  role: UserRole;
}

export type ProfileResponse = PublicProfile | OwnProfile;

export interface UpdateProfileRequest {
  username?: string;
  password?: string;
  address?: string;
  phone?: string;
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
  /** A base64 data URI when the message carries an attachment. */
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

/** The payload exchanged over Socket.IO, which bypasses HTTP entirely. */
export interface ChatSocketMessage {
  room: string;
  sender: string;
  receiver: string;
  message: string;
  image?: string | null;
  timestamp?: IsoDate;
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
}
