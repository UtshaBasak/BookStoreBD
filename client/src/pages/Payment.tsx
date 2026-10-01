import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { safeImageSrc, PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { deliveryChargeFor, site } from '../config/site.js';
import Logo from '../components/Logo.js';
import { priceOf } from '../utils/pricing.js';
import './Homepage.css';
import './Cart.css';
import './Payment.css';

/** How many of each book is being bought, keyed by book id. */
type Quantities = Record<Id, number>;

/** The contact details this page collects, seeded from the stored session. */
interface Buyer {
  name: string;
  email: string;
  phone: string;
}

/** What is written to localStorage once an order is confirmed. */
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
}

const getUserProfile = (): Buyer => {
  return {
    name: localStorage.getItem('username') || '',
    email: localStorage.getItem('userEmail') || '',
    phone: localStorage.getItem('userPhone') || '',
  };
};

/**
 * Reads a previously confirmed order back out of storage.
 *
 * Used as a lazy initialiser so the restored values are present on the very
 * first render, rather than arriving from an effect after an empty one.
 */
const restoreConfirmedOrder = (): ConfirmedOrder | null => {
  try {
    const raw = localStorage.getItem('confirmedOrder');
    if (!raw) return null;
    const order = JSON.parse(raw) as ConfirmedOrder | null;
    const email = localStorage.getItem('userEmail');
    return order && order.email && order.email === email ? order : null;
  } catch {
    return null;
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
  const restored = useMemo(() => restoreConfirmedOrder(), []);

  const [storedUser, setUser] = useState(getUserProfile);
  const [division, setDivision] = useState(restored?.division ?? '');
  const [district, setDistrict] = useState(restored?.district ?? '');
  const [address, setAddress] = useState(restored?.address ?? '');
  // A few words to the seller: "please call before you come".
  const [buyerNote, setBuyerNote] = useState('');
  const [promo, setPromo] = useState(restored?.promo ?? '');
  const [promoMsg, setPromoMsg] = useState('');
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
  const cartQuery = useCart({ enabled: !orderConfirmed && Boolean(storedUser.email) });
  const { mutate: clearCart } = useClearCart();
  // A sold-out book stays in the cart, so it can be bought when it is back,
  // but it cannot be ordered now and is left out here.
  const fullCart = cartQuery.data ?? [];
  const liveCart = fullCart.filter((book) => Number(book.stock) > 0);
  const soldOut = orderConfirmed ? [] : fullCart.filter((book) => !(Number(book.stock) > 0));
  const [leftOut, setLeftOut] = useState<UnavailableItem[]>([]);

  const cartBooks = confirmedBooks ?? liveCart;
  const loading = orderConfirmed ? false : cartQuery.isPending;

  // The profile query fills in details that may have changed since sign-in.
  const { data: profile } = useProfile(storedUser.email, {
    enabled: Boolean(storedUser.email),
  });
  // The contact number is only returned to the owner, so it is read through
  // the guard rather than assumed present on every profile shape.
  const user: Buyer = {
    ...storedUser,
    name: profile?.username || storedUser.name,
    phone: (isOwnProfile(profile) ? profile.phone : null) || storedUser.phone,
  };

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

  const divisions = [
    "Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barisal", "Sylhet", "Rangpur", "Mymensingh"
  ];
  const divisionDistricts: Record<string, string[]> = {
    Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
    Chattogram: ["Chattogram", "Cox's Bazar", "Cumilla", "Brahmanbaria", "Chandpur", "Feni", "Lakshmipur", "Noakhali", "Khagrachari", "Rangamati", "Bandarban"],
    Khulna: ["Khulna", "Bagerhat", "Chuadanga", "Jashore", "Jhenaidah", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
    Rajshahi: ["Rajshahi", "Bogra", "Joypurhat", "Naogaon", "Natore", "Chapai Nawabganj", "Pabna", "Sirajganj"],
    Barisal: ["Barisal", "Barguna", "Bhola", "Jhalokathi", "Patuakhali", "Pirojpur"],
    Sylhet: ["Sylhet", "Habiganj", "Moulvibazar", "Sunamganj"],
    Rangpur: ["Rangpur", "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Thakurgaon"],
    Mymensingh: ["Mymensingh", "Jamalpur", "Netrokona", "Sherpur"]
  };

  useEffect(() => {
    const onStorage = () => setUser(getUserProfile());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const getBookImageSrc = (book: Book): string => {
    const img = book.images?.[0];
    if (typeof img !== 'string' || !img) return PLACEHOLDER_IMAGE;
    // The order is restored from localStorage, so the stored value is not
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

  const handleUserChange = (field: keyof Buyer, value: string) => {
    setUser(u => ({ ...u, [field]: value }));
  };

  const handleConfirmOrder = async () => {
    setConfirmError('');
    if (
      !user.name.trim() ||
      !user.email.trim() ||
      !user.phone.trim() ||
      !division ||
      !district ||
      !address.trim()
    ) {
      // Beside the Confirm button, not in the promo box, which is hidden
      // while no promotion is running.
      setConfirmError('Please fill in all the contact and delivery details.');
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

    // Places the order; the server takes the copies out of stock.
    apiFetch(`${API_BASE_URL}/order/decrease-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: latestCartBooks.map(book => ({
          bookId: book._id,
          quantity: latestQuantities[book._id] || 1
        })),
        // The code only: what it is worth is the server's to work out.
        ...(promoCurrent ? { promo } : {}),
        paymentMethod: 'Cash on Delivery', // The one method offered.
        contactName: user.name,
        contactPhone: user.phone,
        deliveryDivision: division,
        deliveryDistrict: district,
        deliveryAddress: address,
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
        const gone = new Set(missing.map((item) => String(item.bookId)));
        const bought = latestCartBooks.filter((book) => !gone.has(String(book._id)));
        if (missing.length) {
          setCartBooks(bought);
          setLeftOut(missing);
        }
        setOrderNumber(data.orderNumber);
        // What the server actually charged, which may differ from the preview
        // if a book sold out in the meantime.
        setConfirmedCharges({ shipping: data.shippingCharge ?? 0, discount: data.discount ?? 0 });
        if (data.promoMessage) setPromoMsg(data.promoMessage);
        // Cleared only once the order is in, so a failed checkout keeps the
        // basket. Through the mutation, so every header's cart badge updates.
        clearCart();
        // Stored only once there is an order number.
        localStorage.setItem(
          'confirmedOrder',
          JSON.stringify({
            email: user.email,
            orderNumber: data.orderNumber,
            division,
            district,
            address,
            discount: data.discount ?? 0,
            shippingCharge: data.shippingCharge ?? 0,
            promo,
            promoApplied,
            quantities: latestQuantities,
            cartBooks: bought,
          })
        );
        setOrderConfirmed(true);
      } else {
        // Unfreeze, so the basket can be changed and tried again - with the
        // stock as it now is.
        setCartBooks(null);
        freezeQuantities(null);
        void cartQuery.refetch();
        setConfirmError(
          missing.length
            ? `Not enough in stock: ${missing
                .map((item) => (item.available ? `${item.title} (only ${item.available} left)` : `${item.title} (sold out)`))
                .join(', ')}. Change the quantity and try again.`
            : data.message || 'Order confirmation failed. Please try again.'
        );
      }
    })
    .catch(() => {
      setCartBooks(null);
      freezeQuantities(null);
      setConfirmError('Could not reach the shop. Your basket is still here - please try again.');
    });
  };

  useEffect(() => {
    if (!orderConfirmed) return;
    const blockNav = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', blockNav);
    window.history.pushState(null, '', window.location.href);
    const blockPop = () => window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', blockPop);
    return () => {
      window.removeEventListener('beforeunload', blockNav);
      window.removeEventListener('popstate', blockPop);
    };
  }, [orderConfirmed]);

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
          background: book.bookType.toLowerCase() === 'new' ? '#facc15' : '#ffffff',
          color: book.bookType.toLowerCase() === 'new' ? '#111827' : '#5b21b6',
        }}
      >
        {book.bookType.toLowerCase() === 'new' ? 'NEW' : 'OLD'}
      </span>
    ) : null;

  if (!user.email) {
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

              <div className="relative mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                {placedOrder && <OrderPdfButton order={placedOrder} role="buyer" />}
                <button
                  type="button"
                  className="btn btn-accent"
                  style={{ minHeight: 52, padding: '0 2rem', fontSize: 17 }}
                  onClick={() => {
                    localStorage.removeItem('confirmedOrder');
                    window.removeEventListener('beforeunload', () => {});
                    window.removeEventListener('popstate', () => {});
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
                    localStorage.removeItem('confirmedOrder');
                    window.removeEventListener('beforeunload', () => {});
                    window.removeEventListener('popstate', () => {});
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
                {cartBooks.map(book => (
                  <li key={book._id} className="flex items-center gap-3 border-b border-line py-3">
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
                      <div className="leading-snug font-bold text-ink">{book.title}</div>
                      <div className="text-xs text-ink-muted">By {book.author}</div>
                      <div className="mt-1 text-sm text-ink-soft">
                        Quantity: <span className="font-bold">{quantities[book._id] || 1}</span>
                      </div>
                    </div>
                    <div className="price text-right">
                      {money(priceOf(book) * (quantities[book._id] || 1))}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <div className="sum-row">
                  <span>Subtotal</span>
                  <span>{money(subtotal)}</span>
                </div>
                <div className="sum-row">
                  <span>Shipping</span>
                  <span>{shippingShown}</span>
                </div>
                {shownDiscount > 0 && (
                  <div className="sum-row">
                    <span>Discount{promo ? ` (${promo})` : ''}</span>
                    <span style={{ color: '#047857' }}>-{money(shownDiscount)}</span>
                  </div>
                )}
              </div>
              <div className="sum-total">
                <span>Total</span>
                <span>{money(total)}</span>
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
            style={{ fontSize: 18, color: '#6d28d9', background: '#fff', border: '1px solid #e4dcfb', borderRadius: 999 }}
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
                  Sold out before your order went in, so not included:{' '}
                  {leftOut.map((item) => item.title).join(', ')}.
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
                            style={{ color: '#dc2626', fontSize: 15, marginTop: -8, marginRight: -8 }}
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
                              <span className="text-xs font-semibold" style={{ color: '#c2410c' }}>
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
                  <span style={{ color: '#047857' }}>-{money(shownDiscount)}</span>
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
                  <div role="status" className="mt-2 text-sm font-semibold" style={{ color: '#c2410c' }}>
                    Your basket changed. Apply the code again to use it.
                  </div>
                ) : promoMsg && (
                  <div
                    role="status"
                    className="mt-2 text-sm font-semibold"
                    style={{ color: promoCurrent ? '#047857' : '#b91c1c' }}
                  >{promoMsg}</div>
                )}
                <p className="m-0 mt-2 flex items-center gap-2 text-xs text-ink-muted">
                  <FaTag aria-hidden="true" className="shrink-0 text-accent" />
                  <span>First order? <strong className="text-ink-soft">{firstOrder.code}</strong>: {firstOrder.description}.</span>
                </p>
              </div>
              )}
            </div>
            <div className="sum-total">
              <span>Total</span>
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
                  value={user.name}
                  onChange={e => handleUserChange('name', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="checkout-email" className="pay-label">Email address</label>
                <input
                  id="checkout-email"
                  className="field"
                  placeholder="Email Address"
                  autoComplete="email"
                  value={user.email}
                  onChange={e => handleUserChange('email', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="checkout-phone" className="pay-label">Phone number</label>
                <input
                  id="checkout-phone"
                  className="field"
                  placeholder="Phone Number"
                  type="number"
                  value={user.phone}
                  onChange={e => handleUserChange('phone', e.target.value)}
                  onWheel={e => e.currentTarget.blur()}
                  min="0"
                  pattern="[0-9]*"
                />
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
                  onChange={e => setAddress(e.target.value)}
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
              <span className="font-bold text-ink">To pay on delivery</span>
              <span className="price text-xl">{money(total)}</span>
            </div>

            <button
              type="button"
              className="btn btn-accent mt-4 w-full lg:mt-7"
              style={{ minHeight: 54, fontSize: 17 }}
              onClick={handleConfirmOrder}
            >
              Confirm Order
            </button>
            {confirmError && (
              <div className="mt-3 text-center font-semibold" style={{ color: '#b91c1c' }}>
                {confirmError}
              </div>
            )}
            <p className="m-0 mt-3 text-center text-xs text-ink-muted">
              ↩️ Changed your mind? {site.returns.windowDays}-day returns on every book.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
