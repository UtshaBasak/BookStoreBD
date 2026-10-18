import { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaArrowLeft, FaCheck, FaMapMarkerAlt, FaMoneyBillWave, FaTag, FaTrash, FaTruck,
} from 'react-icons/fa';

import type { ApiError, Book, CheckPromoResponse, CreateOrderResponse, Id, UnavailableItem } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useCart, useClearCart, useOrder, useProfile, useSetCartQuantity, useToggleCart } from '../hooks/queries.js';
import OrderPdfButton from '../components/OrderPdfButton.js';
import QuantityStepper from '../components/QuantityStepper.js';
import CopyButton from '../components/CopyButton.js';
import { isOwnProfile } from '../utils/profile.js';
import { getUserEmail } from '../utils/auth.js';
import { CONFIRMED_ORDER_KEY, bdMobile, forgetConfirmedOrder } from '../utils/checkout.js';
import { safeImageSrc, PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { deliveryChargeFor, site } from '../config/site.js';
import { DIVISIONS, DIVISION_DISTRICTS } from '../config/locations.js';
import Logo from '../components/Logo.js';
import { priceOf } from '../utils/pricing.js';
import './Homepage.css';
import './Cart.css';
import './Payment.css';

/** How many of each book is being bought, keyed by book id. */
type Quantities = Record<Id, number>;

/** What is kept in this tab once an order is confirmed, so a reload still shows it. */
interface ConfirmedOrder {
  email: string;
  orderNumber: string;
  division: string;
  district: string;
  address: string;
  discount: number;
  /** What the server charged for delivery. Optional, so an older stored confirmation still restores. */
  shippingCharge?: number;
  promo: string;
  promoApplied: boolean;
  quantities: Quantities;
  cartBooks: Book[];
  /** Books the server left out, or ordered fewer copies of. */
  leftOut?: UnavailableItem[];
  /** Why the promo code was not applied, when it was not. */
  promoMessage?: string;
}

/** Made once per visit to checkout and sent with every try, so a retry never places a second order. */
const newCheckoutId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Why the server left a book out of an order, or ordered fewer copies, in a few words. */
const leftOutReason = (item: UnavailableItem): string => {
  switch (item.reason) {
    case 'short':
      return `only ${item.reserved} of ${item.requested} were left, and those are in your order`;
    case 'removed':
      return 'no longer listed';
    case 'own-listing':
      return 'your own listing';
    case 'seller-unavailable':
      return 'the seller is not taking orders just now';
    default:
      return 'sold out';
  }
};

/**
 * Reads a confirmed order back, for a reload of its own confirmation page.
 *
 * Only for the order number in the address and the person signed in: a plain
 * visit to checkout always starts a new checkout, however the last one was
 * left.
 */
const restoreConfirmedOrder = (orderNumber: string | null, email: string): ConfirmedOrder | null => {
  if (!orderNumber || !email) return null;
  try {
    const raw = sessionStorage.getItem(CONFIRMED_ORDER_KEY);
    if (!raw) return null;
    const order = JSON.parse(raw) as ConfirmedOrder | null;
    return order && order.email === email && order.orderNumber === orderNumber ? order : null;
  } catch {
    return null;
  }
};

const keepConfirmedOrder = (order: ConfirmedOrder): void => {
  try {
    sessionStorage.setItem(CONFIRMED_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* blocked storage: the confirmation still shows until the page is left */
  }
};

/** The slim bar across the top: the logo, and how far through checkout this is. */
function CheckoutTopBar({ step, linkHome = false }: { step: 1 | 2 | 3; linkHome?: boolean }) {
  const steps = ['Cart', 'Details', 'Done'];
  return (
    <header className="header shop-topbar">
      {linkHome ? (
        <Link to="/" className="logo-button" title="Go to Homepage" aria-label="BookStoreBD home">
          <Logo size={34} />
        </Link>
      ) : (
        <Logo size={34} />
      )}
      <ol className="checkout-steps" aria-label="Checkout progress">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step || step === 3;
          const current = n === step;
          return (
            <li
              key={label}
              className={[done && 'is-done', current && 'is-current'].filter(Boolean).join(' ')}
              aria-current={current ? 'step' : undefined}
            >
              <span className="step-dot" aria-hidden="true">{done ? <FaCheck /> : n}</span>
              <span className="step-word">{label}</span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}

export default function Payment() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Who is signed in, from the session - not from a field on this page, so
  // nothing typed here changes whose cart or profile is loaded.
  const email = getUserEmail() ?? '';
  const asked = searchParams.get('order');
  // Read once, for the order in the address; never re-read as the page changes.
  const [restored] = useState(() => restoreConfirmedOrder(asked, email));

  const [division, setDivision] = useState(restored?.division ?? '');
  const [district, setDistrict] = useState(restored?.district ?? '');
  // What the shopper types wins; until they type, the profile fills it in.
  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [phoneEdit, setPhoneEdit] = useState<string | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [addressEdit, setAddressEdit] = useState<string | null>(restored?.address ?? null);
  const [checkoutId] = useState(newCheckoutId);
  const [placing, setPlacing] = useState(false);
  // A few words to the seller: "please call before you come".
  const [buyerNote, setBuyerNote] = useState('');
  const [promo, setPromo] = useState(restored?.promo ?? '');
  const [promoMsg, setPromoMsg] = useState(restored?.promoMessage ?? '');
  // Why the server did not apply the code when the order was placed, if it did not.
  const [refusedPromo, setRefusedPromo] = useState(restored?.promoMessage ?? '');
  const [promoApplied, setPromoApplied] = useState(restored?.promoApplied ?? false);
  const [discount, setDiscount] = useState(restored?.discount ?? 0);
  const [freeDelivery, setFreeDelivery] = useState(false);
  // The books total the code was checked against.
  const [appliedFor, setAppliedFor] = useState<number | null>(null);
  // What the server charged once the order is placed - kept with the stored
  // confirmation, so a reload shows the real figures, not a recalculation.
  const [confirmedCharges, setConfirmedCharges] = useState<{ shipping: number; discount: number } | null>(
    restored ? { shipping: restored.shippingCharge ?? 0, discount: restored.discount ?? 0 } : null
  );
  const [orderNumber, setOrderNumber] = useState(restored?.orderNumber ?? '');
  const [confirmedBooks, setConfirmedBooks] = useState<Book[] | null>(restored?.cartBooks ?? null);
  const [confirmedQuantities, setConfirmedQuantities] = useState<Quantities | null>(
    restored?.quantities ?? null
  );
  // Named for clarity at the call site that freezes the basket on confirmation.
  const freezeQuantities = setConfirmedQuantities;
  const [orderConfirmed, setOrderConfirmed] = useState(Boolean(restored));
  const [confirmError, setConfirmError] = useState('');
  // The order as the server has it, once placed: what the PDF receipt is drawn from.
  const { data: placedOrder } = useOrder(orderConfirmed && orderNumber ? orderNumber : undefined);

  // The live cart only matters until an order is confirmed; after that the
  // page shows what was actually bought.
  const cartQuery = useCart({ enabled: !orderConfirmed && Boolean(email) });
  const { mutate: clearCart } = useClearCart();
  // A sold-out book stays in the cart, so it can be bought when it is back,
  // but it cannot be ordered now and is left out here.
  const fullCart = cartQuery.data ?? [];
  const liveCart = fullCart.filter((book) => Number(book.stock) > 0);
  const soldOut = orderConfirmed ? [] : fullCart.filter((book) => !(Number(book.stock) > 0));
  const [leftOut, setLeftOut] = useState<UnavailableItem[]>(restored?.leftOut ?? []);

  const cartBooks = confirmedBooks ?? liveCart;
  const loading = orderConfirmed ? false : cartQuery.isPending;

  // The shopper's own profile fills in the name, phone and address.
  const { data: profile } = useProfile(email || undefined, { enabled: Boolean(email) });
  // The phone and address are only returned to the owner, so they are read
  // through the guard rather than assumed present on every profile shape.
  const own = isOwnProfile(profile) ? profile : null;
  const name = nameEdit ?? profile?.username ?? '';
  const phone = phoneEdit ?? own?.phone ?? '';
  const address = addressEdit ?? own?.address ?? '';
  const phoneNumber = bdMobile(phone);
  const phoneProblem = phoneTouched && phone.trim() && !phoneNumber
    ? 'Enter an 11-digit mobile number, like 01712345678.'
    : '';

  // How many of each: what the cart holds, which the cart page and the book
  // page set, never more than is in stock.
  const quantities: Quantities =
    confirmedQuantities ??
    Object.fromEntries(
      liveCart.map((book) => [book._id, Math.max(1, Math.min(book.cartQuantity ?? 1, Number(book.stock) || 1))])
    );
  const setCartBooks = setConfirmedBooks;
  const { mutate: setCartQuantity, isPending: savingQuantity } = useSetCartQuantity();
  const { mutate: toggleCart } = useToggleCart();

  const divisions = DIVISIONS;
  const divisionDistricts = DIVISION_DISTRICTS;

  // Signed out, or in as someone else, in another tab: draw the page again
  // for whoever it is now.
  const [, setSessionSeen] = useState(0);
  useEffect(() => {
    const onStorage = () => setSessionSeen((n) => n + 1);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const getBookImageSrc = (book: Book): string => {
    const img = book.images?.[0];
    if (typeof img !== 'string' || !img) return PLACEHOLDER_IMAGE;
    // The order is restored from session storage, so the stored value is not
    // trusted: validate the scheme before it reaches an <img src>.
    // A path is either a cover served by the API or the placeholder; both
    // are same-origin and `safeImageSrc` checks the scheme either way.
    if (img.startsWith('data:image/') || /^https?:\/\//.test(img) || img.startsWith('/')) {
      // Cloudinary delivers the size the row draws, not the original.
      return safeImageSrc(sized(img, IMAGE_WIDTHS.row), PLACEHOLDER_IMAGE);
    }
    return safeImageSrc(`${API_BASE_URL}/uploads/${encodeURIComponent(img)}`, PLACEHOLDER_IMAGE);
  };

  // Saved to the cart as it changes, so leaving and coming back - or going
  // to the cart page - keeps the number chosen here.
  const handleQuantityChange = (bookId: Id, quantity: number) => {
    setCartQuantity({ bookId, quantity });
  };

  const handleRemoveBook = (bookId: Id) => {
    toggleCart({ bookId, inCart: true });
  };

  // The sale price, which is what the order is charged, times the copies.
  const subtotal = cartBooks.reduce((sum, book) => sum + priceOf(book) * (quantities[book._id] || 1), 0);

  /*
   * A code's preview belongs to the basket it was checked against. Once a
   * quantity changes it may no longer match what the server will charge (a
   * FreeDelivery basket taken under 1000 Tk would be refused), so it stops
   * counting until it is applied again.
   */
  const promoCurrent = promoApplied && appliedFor === subtotal;
  const previewFree = promoCurrent && freeDelivery;

  /*
   * A preview of what the API will charge, by the same rule (priced by
   * district, not division). The server works out the real charge itself;
   * once the order is placed, that figure is shown instead.
   */
  const shipping =
    confirmedCharges?.shipping ?? (district ? (previewFree ? 0 : deliveryChargeFor(district)) : 0);
  const shownDiscount = confirmedCharges?.discount ?? (promoCurrent ? discount : 0);
  // Until a district is chosen the charge is not known, and a 0 would read as
  // free delivery.
  const shippingKnown = Boolean(district) || previewFree || confirmedCharges !== null;
  const shippingLabel = !shippingKnown
    ? 'Choose your district'
    : shipping === 0
      ? 'Free'
      : `${shipping.toFixed(2)} Tk.`;

  /*
   * The server says what a code is worth. The order prices the code again
   * when it is placed, so this is only a preview.
   */
  const handleApplyPromo = async () => {
    if (promoCurrent || !promo.trim()) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/order/promo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promo, booksTotal: subtotal }),
      });
      const data = (await res.json()) as CheckPromoResponse & ApiError;
      if (!res.ok) {
        setPromoApplied(false);
        setDiscount(0);
        setFreeDelivery(false);
        setPromoMsg(data.message || 'That code is not valid.');
        return;
      }
      setPromo(data.code);
      setDiscount(data.discount);
      setFreeDelivery(data.freeDelivery);
      setAppliedFor(subtotal);
      setPromoApplied(true);
      setPromoMsg(
        data.freeDelivery
          ? `${data.description}: delivery is free.`
          : `${data.description}: ${data.discount.toFixed(2)} Tk off.`
      );
    } catch {
      setPromoMsg('Could not check that code. Please try again.');
    }
  };

  const handleRemovePromo = () => {
    setPromo('');
    setPromoMsg('');
    setPromoApplied(false);
    setDiscount(0);
    setFreeDelivery(false);
  };

  const total = Math.max(0, subtotal + shipping - shownDiscount);

  // Books worth enough for free delivery, and the code not in use: say so.
  const { firstOrder, freeDelivery: freeDeliveryPromo } = site.promotions;
  const couldHaveFreeDelivery =
    !confirmedCharges && !previewFree && subtotal >= freeDeliveryPromo.minBooksTotal;

  const handleConfirmOrder = async () => {
    // One order at a time: a second click while the first is on its way
    // does nothing (and the server would refuse it anyway).
    if (placing) return;
    setConfirmError('');
    if (!name.trim() || !phone.trim() || !division || !district || !address.trim()) {
      // Beside the Confirm button, not in the promo box, which is hidden
      // while no promotion is running.
      setConfirmError('Please fill in all the contact and delivery details.');
      return;
    }
    if (!phoneNumber) {
      setPhoneTouched(true);
      setConfirmError('Enter an 11-digit mobile number, like 01712345678, so the courier can call you.');
      return;
    }
    if (address.trim().length < 5) {
      setConfirmError('Please write the full address: house, road and area.');
      return;
    }
    if (cartBooks.length === 0) {
      setConfirmError('You must add at least one book to confirm your order.');
      return;
    }
    // Not silently dropped: the shopper saw a price with the code in it.
    if (promoApplied && !promoCurrent) {
      setConfirmError('Your basket changed since you applied the code. Apply it again, or remove it.');
      return;
    }

    // Always use the current UI quantities for the books in cart
    const latestCartBooks = [...cartBooks];
    const latestQuantities: Quantities = {};
    latestCartBooks.forEach(book => {
      latestQuantities[book._id] = quantities[book._id] || 1;
    });

    // Freeze what was actually bought, so the confirmation page keeps showing
    // it after the cart itself is cleared.
    setCartBooks(latestCartBooks);
    freezeQuantities(latestQuantities);

    // Places the order; the server takes the copies out of stock. The same
    // checkout id goes with every try, so a retry after a lost answer gets
    // the same order back rather than a second one.
    setPlacing(true);
    await apiFetch(`${API_BASE_URL}/order/decrease-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: latestCartBooks.map(book => ({
          bookId: book._id,
          quantity: latestQuantities[book._id] || 1
        })),
        checkoutId,
        // The code only: what it is worth is the server's to work out.
        ...(promoCurrent ? { promo } : {}),
        paymentMethod: 'Cash on Delivery', // The one method offered.
        contactName: name.trim(),
        contactPhone: phoneNumber,
        deliveryDivision: division,
        deliveryDistrict: district,
        deliveryAddress: address.trim(),
        ...(buyerNote.trim() ? { buyerNote: buyerNote.trim() } : {}),
      })
    })
    .then(async res => ({ ok: res.ok, data: (await res.json()) as CreateOrderResponse & ApiError & { unavailable?: UnavailableItem[] } }))
    .then(({ ok, data }) => {
      const missing = data.unavailable ?? [];
      if (ok && data.orderNumber) {
        // A book that sold out between the page loading and the order going
        // in is not in the order: the confirmation says so, and does not
        // show it as bought.
        // A book with fewer copies left than asked for is in the order with
        // the copies there were.
        const gone = new Set(missing.filter((item) => !item.reserved).map((item) => String(item.bookId)));
        for (const item of missing) {
          if (item.reserved) latestQuantities[String(item.bookId)] = item.reserved;
        }
        freezeQuantities({ ...latestQuantities });
        const bought = latestCartBooks.filter((book) => !gone.has(String(book._id)));
        if (missing.length) {
          setCartBooks(bought);
          setLeftOut(missing);
        }
        setOrderNumber(data.orderNumber);
        // What the server actually charged, which may differ from the preview
        // if a book sold out in the meantime.
        setConfirmedCharges({ shipping: data.shippingCharge ?? 0, discount: data.discount ?? 0 });
        if (data.promoMessage) {
          setPromoMsg(data.promoMessage);
          setRefusedPromo(data.promoMessage);
        }
        // Cleared only once the order is in, so a failed checkout keeps the
        // basket. Through the mutation, so every header's cart badge updates.
        clearCart();
        // Kept for this tab only, under its order number, which goes in the
        // address: a reload shows this confirmation again, and the next visit
        // to checkout starts afresh.
        keepConfirmedOrder({
          email,
          orderNumber: data.orderNumber,
          division,
          district,
          address: address.trim(),
          discount: data.discount ?? 0,
          shippingCharge: data.shippingCharge ?? 0,
          promo,
          promoApplied: promoApplied && !data.promoMessage,
          quantities: latestQuantities,
          cartBooks: bought,
          leftOut: missing,
          ...(data.promoMessage ? { promoMessage: data.promoMessage } : {}),
        });
        setSearchParams({ order: data.orderNumber }, { replace: true });
        setOrderConfirmed(true);
      } else {
        // Unfreeze, so the basket can be changed and tried again - with the
        // stock as it now is.
        setCartBooks(null);
        freezeQuantities(null);
        void cartQuery.refetch();
        setConfirmError(
          missing.length
            ? `These books can't be ordered right now: ${missing
                .map((item) => `${item.title ?? 'A book'} (${leftOutReason(item)})`)
                .join(', ')}. Remove them from your basket and try again.`
            : data.errors?.[0]?.message || data.message || 'Order confirmation failed. Please try again.'
        );
      }
    })
    .catch(() => {
      setCartBooks(null);
      freezeQuantities(null);
      setConfirmError('Could not reach the shop. Your basket is still here - please try again.');
    })
    .finally(() => setPlacing(false));
  };

  /*
   * The confirmation shows the order as the server placed it - its books,
   * copies, prices and charges - once it has loaded, rather than the cart's
   * prices. Until then, what was sent, with the charges the server answered.
   */
  const placedBooks = (placedOrder?.books ?? []).filter((line) => line.status !== 'Cancelled');
  const coverOf = new Map(cartBooks.map((book) => [String(book._id), book]));
  const placedLines = placedBooks.length
    ? placedBooks.map((line) => ({
        key: String(line._id),
        book: coverOf.get(String(line.bookId)),
        title: line.title ?? '',
        author: line.author ?? '',
        quantity: Number(line.quantity) || 1,
        price: Number(line.price) || 0,
      }))
    : cartBooks.map((book) => ({
        key: String(book._id),
        book,
        title: book.title,
        author: book.author,
        quantity: quantities[book._id] || 1,
        price: priceOf(book),
      }));
  const placedTotals = placedOrder
    ? {
        books: placedOrder.booksTotal,
        shipping: placedOrder.shippingCost,
        discount: Number(placedOrder.discount ?? 0),
        total: placedOrder.totalCost,
      }
    : { books: subtotal, shipping, discount: shownDiscount, total };
  const placedPromo = placedOrder
    ? (placedOrder.promoApplied ? placedOrder.promo : '')
    : promoApplied && !refusedPromo ? promo : '';

  // Display only: every figure is worked out above, and shown here with the
  // taka sign the rest of the shop uses.
  const money = (amount: number) => `৳${amount.toFixed(2)}`;
  const shippingShown = shippingKnown && shipping !== 0 ? money(shipping) : shippingLabel;

  const typeBadge = (book: Book) =>
    book.bookType ? (
      <span
        className="badge pay-cover-badge"
        style={{
          position: 'absolute',
          background: book.bookType.toLowerCase() === 'new' ? '#facc15' : 'var(--color-surface)',
          color: book.bookType.toLowerCase() === 'new' ? '#111827' : 'var(--color-brand-dark)',
        }}
      >
        {book.bookType.toLowerCase() === 'new' ? 'NEW' : 'OLD'}
      </span>
    ) : null;

  // A confirmation link opened without its stored copy - another tab, or
  // after signing out and in - goes to the order itself.
  if (asked && !restored && !orderConfirmed) {
    return <Navigate to={`/order-tracking/${encodeURIComponent(asked)}`} replace />;
  }

  if (!email) {
    return (
      <div className="shop-page">
        <CheckoutTopBar step={2} linkHome />
        <main className="shop-main">
          <div className="card mx-auto max-w-md p-8 text-center">
            <p className="m-0 mb-5 text-lg font-semibold text-ink">Please sign in to proceed to payment.</p>
            <Link to="/sign-in" className="btn btn-primary">Sign in</Link>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="shop-page">
        <CheckoutTopBar step={2} linkHome />
        <main className="shop-main">
          <p role="status" className="py-16 text-center font-semibold text-ink-muted">Loading...</p>
        </main>
      </div>
    );
  }

  if (orderConfirmed) {
    return (
      <div className="shop-page">
        {/* No link home in the bar: leaving goes through the buttons below,
            which also forget the stored confirmation. */}
        <CheckoutTopBar step={3} />
        <main className="shop-main">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="card confirm-card px-5 py-10 text-center sm:px-10">
              <div className="confirm-check" aria-hidden="true">
                <FaCheck />
                <span className="confetti c1" />
                <span className="confetti c2" />
                <span className="confetti c3" />
                <span className="confetti c4" />
                <span className="confetti c5" />
              </div>
              <h1 className="relative m-0" style={{ fontSize: 'clamp(1.8rem, 1.3rem + 2vw, 2.4rem)' }}>
                Checkout Complete!
              </h1>
              <p className="relative m-0 mt-1 text-lg font-semibold text-ink-soft">Thank You For Your Purchase! 🎉</p>

              <div className="relative mt-6">
                <div className="text-xs font-bold tracking-wider text-ink-muted uppercase">Order number</div>
                <div className="order-no">#{orderNumber}<CopyButton text={orderNumber} /></div>
              </div>

              <p className="relative mx-auto mt-5 mb-0 max-w-sm text-sm leading-relaxed text-ink-muted">
                Pay in cash when your books arrive - by courier in {site.delivery.daysInsideDhaka} working days in
                Dhaka, {site.delivery.daysOutsideDhaka} elsewhere.
              </p>
              {leftOut.length > 0 && (
                <p role="status" className="pay-notice relative mx-auto mt-4 max-w-sm text-left">
                  Not everything could go in this order:{' '}
                  {leftOut.map((item) => `${item.title ?? 'A book'} (${leftOutReason(item)})`).join(', ')}.
                </p>
              )}
              {refusedPromo && (
                <p role="status" className="pay-notice relative mx-auto mt-4 max-w-sm text-left">
                  The code {promo} was not applied: {refusedPromo} The total below is without it.
                </p>
              )}

              <div className="relative mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                {placedOrder && <OrderPdfButton order={placedOrder} role="buyer" />}
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ minHeight: 52, padding: '0 2rem', fontSize: 17 }}
                  onClick={() => {
                    forgetConfirmedOrder();
                    navigate(`/order-tracking/${orderNumber}`);
                  }}
                >
                  <FaTruck aria-hidden="true" /> Track Your Order
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 52 }}
                  onClick={() => {
                    forgetConfirmedOrder();
                    navigate('/');
                  }}
                >
                  Go To Home
                </button>
              </div>
            </section>

            <aside className="card p-5 sm:p-7" aria-label="Order Summary">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg">Order Summary</h2>
                <span className="font-mono text-sm font-bold text-brand-dark">#{orderNumber}</span>
                <CopyButton text={orderNumber} />
              </div>
              <ul className="m-0 list-none p-0">
                {placedLines.map(line => (
                  <li key={line.key} className="flex items-center gap-3 border-b border-line py-3">
                    <div className="relative shrink-0">
                      <img
                        loading="lazy"
                        decoding="async"
                        src={line.book ? getBookImageSrc(line.book) : PLACEHOLDER_IMAGE}
                        alt={line.title}
                        className="pay-cover"
                      />
                      {line.book && typeBadge(line.book)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="leading-snug font-bold text-ink">{line.title}</div>
                      <div className="text-xs text-ink-muted">By {line.author}</div>
                      <div className="mt-1 text-sm text-ink-soft">
                        Quantity: <span className="font-bold">{line.quantity}</span>
                      </div>
                    </div>
                    <div className="price text-right">{money(line.price * line.quantity)}</div>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <div className="sum-row">
                  <span>Subtotal</span>
                  <span>{money(placedTotals.books)}</span>
                </div>
                <div className="sum-row">
                  <span>Shipping</span>
                  <span>{placedTotals.shipping === 0 ? 'Free' : money(placedTotals.shipping)}</span>
                </div>
                {placedTotals.discount > 0 && (
                  <div className="sum-row">
                    <span>Discount{placedPromo ? ` (${placedPromo})` : ''}</span>
                    <span style={{ color: 'var(--color-success-dark)' }}>-{money(placedTotals.discount)}</span>
                  </div>
                )}
              </div>
              <div className="sum-total">
                <span>To pay on delivery</span>
                <span>{money(placedTotals.total)}</span>
              </div>
              <div className="mt-5 grid gap-3 rounded-2xl bg-brand-tint p-4 text-sm">
                <div className="flex items-center gap-2">
                  <FaMoneyBillWave aria-hidden="true" className="shrink-0 text-brand" />
                  <span>
                    Payment Method: <span className="font-bold text-ink">Cash On Delivery</span>
                  </span>
                </div>
                {address && (
                  <div className="flex items-start gap-2">
                    <FaMapMarkerAlt aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
                    <span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>
                      Delivering to {address}, {district}, {division}
                    </span>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shop-page">
      <CheckoutTopBar step={2} linkHome />
      <main className="shop-main">
        <div className="mb-5 flex items-center gap-2">
          {/* A real link, so it is focusable and follows on Enter. */}
          <Link to="/cart"
            className="icon-button"
            style={{ fontSize: 18, color: 'var(--color-brand)', background: 'var(--color-surface)', border: '1px solid var(--color-brand-line)', borderRadius: 999 }}
            title="Go back to cart"
            aria-label="Go back to cart"
          ><FaArrowLeft /></Link>
          <div>
            <h1 className="shop-title">Checkout</h1>
            <p className="shop-sub">Almost there - tell us where to bring your books.</p>
          </div>
        </div>

        {/* Two columns on a desktop, one on a phone, so the address form keeps
            a usable width. The summary comes first in the page, so a phone
            shows the basket and its total before the form; on a desktop it
            moves to the right. */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <aside
            className="card min-w-0 p-5 sm:p-7 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1"
            aria-label="Your Order"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="m-0 text-lg">Your Order</h2>
              {orderConfirmed && <div className="font-bold text-brand">#{orderNumber}</div>}
            </div>
            <div className="lg:max-h-85 lg:overflow-y-auto">
              {leftOut.length > 0 && (
                <p role="status" className="pay-notice">
                  Not everything could go in this order:{' '}
                  {leftOut.map((item) => `${item.title ?? 'A book'} (${leftOutReason(item)})`).join(', ')}.
                </p>
              )}
              {soldOut.length > 0 && (
                <p role="status" className="pay-notice">
                  Sold out, so left out of this order: {soldOut.map((book) => book.title).join(', ')}. It stays in
                  your cart for when it is back.
                </p>
              )}
              {cartBooks.length === 0 ? (
                <div className="p-6 text-center text-ink-muted">
                  {soldOut.length ? 'Nothing in your cart is in stock right now.' : 'No books in cart.'}
                </div>
              ) : (
                <ul className="m-0 list-none p-0">
                  {cartBooks.map(book => (
                    <li key={book._id} className="flex gap-3 border-b border-line py-3">
                      {/* `shrink-0` keeps the cover its size in a narrow flex row,
                          so the badge positioned against it stays clear of the title. */}
                      <div className="relative shrink-0">
                        <img
                          loading="lazy"
                          decoding="async"
                          src={getBookImageSrc(book)}
                          alt={book.title}
                          className="pay-cover"
                        />
                        {typeBadge(book)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <div className="leading-snug font-bold text-ink">{book.title}</div>
                            <div className="text-xs text-ink-muted">By {book.author}</div>
                          </div>
                          <button
                            type="button"
                            className="icon-button shrink-0"
                            style={{ color: 'var(--color-danger-dark)', fontSize: 15, marginTop: -8, marginRight: -8 }}
                            onClick={() => handleRemoveBook(book._id)}
                            title="Remove from cart"
                            aria-label="Remove from cart"
                          ><FaTrash /></button>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex flex-col items-start gap-0.5">
                            <QuantityStepper
                              value={quantities[book._id] || 1}
                              max={Number(book.stock) || 1}
                              onChange={(value) => handleQuantityChange(book._id, value)}
                              disabled={savingQuantity}
                              label={`Copies of ${book.title}`}
                            />
                            {Number(book.stock) <= 5 && (
                              <span className="text-xs font-semibold" style={{ color: 'var(--color-warn-ink)' }}>
                                Only {book.stock} left
                              </span>
                            )}
                          </div>
                          <div className="price">
                            {money(priceOf(book) * (quantities[book._id] || 1))}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3">
              <div className="sum-row">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="sum-row">
                <span>Shipping</span>
                <span>{shippingShown}</span>
              </div>
              <p className="m-0 mb-1 flex gap-2 text-xs leading-relaxed text-ink-muted">
                <FaTruck aria-hidden="true" className="mt-0.5 shrink-0 text-brand-light" />
                <span>
                  {site.delivery.insideDhaka} Tk inside Dhaka, {site.delivery.outsideDhaka} Tk elsewhere,
                  free with {freeDeliveryPromo.code} on {freeDeliveryPromo.minBooksTotal} Tk or more. By courier
                  in {site.delivery.daysInsideDhaka} working days in Dhaka, {site.delivery.daysOutsideDhaka} elsewhere.
                  {' '}{site.payment}.
                </span>
              </p>
              {shownDiscount > 0 && (
                <div className="sum-row">
                  <span>Discount</span>
                  <span style={{ color: 'var(--color-success-dark)' }}>-{money(shownDiscount)}</span>
                </div>
              )}
              {/*
                Hidden while no promotion is running: a code box that can only
                ever say "not valid" invites a shopper to go hunting for a code
                that does not exist. The rules are in server/config/promotions.ts.
              */}
              {site.promoCodes && (
              <div className="promo-box">
                {/*
                  The moment it applies, not buried in the terms: a code nobody
                  hears about gives nobody free delivery.
                */}
                {couldHaveFreeDelivery && (
                  <p role="note" className="promo-hint">
                    <span aria-hidden="true">🚚</span>
                    <span>
                      Your books come to {freeDeliveryPromo.minBooksTotal} Tk or more: use the code{' '}
                      <strong>{freeDeliveryPromo.code}</strong> for free delivery
                      {promoCurrent ? ' instead - one code per order.' : '.'}
                    </span>
                  </p>
                )}
                <label htmlFor="promo-code" className="pay-label">
                  Promo code or voucher
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="promo-code"
                    className="field min-w-0 flex-1"
                    style={{ minWidth: 140 }}
                    value={promo}
                    onChange={e => { setPromo(e.target.value); setPromoMsg(''); setPromoApplied(false); setDiscount(0); setFreeDelivery(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') void handleApplyPromo(); }}
                    disabled={promoCurrent}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ minHeight: 46 }}
                    onClick={() => void handleApplyPromo()}
                    disabled={promoCurrent}
                  >Apply</button>
                  {promoApplied && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ minHeight: 46 }}
                      onClick={handleRemovePromo}
                    >Remove</button>
                  )}
                </div>
                {promoApplied && !promoCurrent ? (
                  <div role="status" className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-warn-ink)' }}>
                    Your basket changed. Apply the code again to use it.
                  </div>
                ) : promoMsg && (
                  <div
                    role="status"
                    className="mt-2 text-sm font-semibold"
                    style={{ color: promoCurrent ? 'var(--color-success-dark)' : 'var(--color-danger-ink)' }}
                  >{promoMsg}</div>
                )}
                <p className="m-0 mt-2 flex items-center gap-2 text-xs text-ink-muted">
                  <FaTag aria-hidden="true" className="shrink-0 text-accent" />
                  <span>First order? <strong className="text-ink-soft">{firstOrder.code}</strong>: {firstOrder.description}.</span>
                </p>
              </div>
              )}
            </div>
            {/* Until a district is chosen the delivery charge is not known, so
                the total says it is before delivery. */}
            <div className="sum-total">
              <span>{shippingKnown ? 'Total' : 'Total before delivery'}</span>
              <span>{money(total)}</span>
            </div>
          </aside>

          <section className="card min-w-0 p-5 sm:p-7 lg:col-start-1 lg:row-start-1" aria-label="Your details">
            <h2 className="pay-section-title"><span className="num" aria-hidden="true">1</span>Payment Method</h2>
            <div className="pay-method">
              <span className="pay-radio" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink">Cash On Delivery</div>
                <div className="text-sm text-ink-muted">Pay the courier when your books arrive.</div>
              </div>
              <FaMoneyBillWave aria-hidden="true" className="shrink-0 text-2xl text-brand" />
            </div>

            <h2 className="pay-section-title"><span className="num" aria-hidden="true">2</span>Contact Information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="checkout-name" className="pay-label">Name</label>
                <input
                  id="checkout-name"
                  className="field"
                  placeholder="Name"
                  autoComplete="name"
                  value={name}
                  onChange={e => setNameEdit(e.target.value)}
                />
              </div>
              <div>
                {/* The account the order goes on, and where its e-mails go: shown,
                    not edited here. */}
                <label htmlFor="checkout-email" className="pay-label">Email address</label>
                <input
                  id="checkout-email"
                  className="field"
                  autoComplete="email"
                  value={email}
                  readOnly
                  aria-describedby="checkout-email-note"
                />
                <p id="checkout-email-note" className="m-0 mt-1 text-xs text-ink-muted">
                  Your order confirmation goes here.
                </p>
              </div>
              <div>
                <label htmlFor="checkout-phone" className="pay-label">Phone number</label>
                {/* Text, not a number field: a number field reads "+880 17..." as
                    empty. */}
                <input
                  id="checkout-phone"
                  className="field"
                  placeholder="01712345678"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={e => setPhoneEdit(e.target.value)}
                  onBlur={() => setPhoneTouched(true)}
                  aria-invalid={phoneProblem ? true : undefined}
                  aria-describedby={phoneProblem ? 'checkout-phone-problem' : undefined}
                />
                {phoneProblem && (
                  <p id="checkout-phone-problem" className="m-0 mt-1 text-xs font-semibold" style={{ color: 'var(--color-danger-ink)' }}>
                    {phoneProblem}
                  </p>
                )}
              </div>
            </div>

            <h2 className="pay-section-title"><span className="num" aria-hidden="true">3</span>Delivery Information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="checkout-division" className="pay-label">Division</label>
                <select
                  id="checkout-division"
                  className="field"
                  value={division}
                  onChange={e => {
                    setDivision(e.target.value);
                    setDistrict('');
                  }}
                >
                  <option value="">Select Division</option>
                  {divisions.map(div => (
                    <option key={div} value={div}>{div}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="checkout-district" className="pay-label">District</label>
                <select
                  id="checkout-district"
                  className="field"
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  disabled={!division}
                >
                  <option value="">Select District</option>
                  {division && (divisionDistricts[division] ?? []).map(dist => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="checkout-address" className="pay-label">Address</label>
                <textarea
                  id="checkout-address"
                  className="field"
                  placeholder="Please write detailed address"
                  rows={3}
                  value={address}
                  onChange={e => setAddressEdit(e.target.value)}
                  style={{ minHeight: 96, padding: '12px 14px', resize: 'none' }}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="checkout-note" className="pay-label">
                  Note to the seller <span className="font-normal text-ink-muted">(optional)</span>
                </label>
                <textarea
                  id="checkout-note"
                  name="buyerNote"
                  className="field"
                  placeholder="For example: please call before delivery, or a gift - no price inside"
                  rows={2}
                  maxLength={300}
                  value={buyerNote}
                  onChange={e => setBuyerNote(e.target.value)}
                  disabled={orderConfirmed}
                  style={{ minHeight: 64, padding: '12px 14px', resize: 'vertical' }}
                />
                <p className="m-0 mt-1 text-right text-xs text-ink-muted">{buyerNote.length}/300</p>
              </div>
            </div>

            {/* The total again beside the button on a phone, where the summary
                is a long way back up the page. */}
            <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-accent-tint px-4 py-3 lg:hidden">
              <span className="font-bold text-ink">{shippingKnown ? 'To pay on delivery' : 'Total before delivery'}</span>
              <span className="price text-xl">{money(total)}</span>
            </div>

            <button
              type="button"
              className="btn btn-accent mt-4 w-full lg:mt-7"
              style={{ minHeight: 54, fontSize: 17 }}
              onClick={() => void handleConfirmOrder()}
              disabled={placing}
              aria-busy={placing || undefined}
            >
              {placing ? 'Placing your order…' : 'Confirm Order'}
            </button>
            {confirmError && (
              <div className="mt-3 text-center font-semibold" style={{ color: 'var(--color-danger-ink)' }}>
                {confirmError}
              </div>
            )}
            <p className="m-0 mt-3 text-center text-xs text-ink-muted">
              ↩️ Not as described? Ask for a return within {site.returns.windowDays} days of delivery, with a photo.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
