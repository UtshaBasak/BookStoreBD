import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ApiError, Book, CheckPromoResponse, CreateOrderResponse, Id } from '@shared/api.js';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useCart, useClearCart, useProfile } from '../hooks/queries.js';
import { isOwnProfile } from '../utils/profile.js';
import { safeImageSrc, PLACEHOLDER_IMAGE } from '../utils/safeImageSrc.js';
import { sized, IMAGE_WIDTHS } from '../utils/imageUrl.js';
import { deliveryChargeFor, site } from '../config/site.js';

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
  /** What the server charged for delivery. Absent on confirmations stored before it was kept. */
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
 * first render. Pushing them in from an effect meant rendering an empty page
 * and then immediately re-rendering a full one.
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

export default function Payment() {
  const navigate = useNavigate();
  const restored = useMemo(() => restoreConfirmedOrder(), []);

  const [storedUser, setUser] = useState(getUserProfile);
  const [division, setDivision] = useState(restored?.division ?? '');
  const [district, setDistrict] = useState(restored?.district ?? '');
  const [address, setAddress] = useState(restored?.address ?? '');
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

  // The live cart only matters until an order is confirmed; after that the
  // page shows what was actually bought.
  const cartQuery = useCart({ enabled: !orderConfirmed && Boolean(storedUser.email) });
  const { mutate: clearCart } = useClearCart();
  const liveCart = cartQuery.data ?? [];

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

  const [quantityOverrides, setQuantityOverrides] = useState<Quantities>({});
  const quantities: Quantities =
    confirmedQuantities ??
    Object.fromEntries(liveCart.map((book) => [book._id, quantityOverrides[book._id] ?? 1]));
  const setQuantities = setQuantityOverrides;
  const setCartBooks = setConfirmedBooks;

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

  // Helper for sticker color
  const getStickerColor = (bookType: string | undefined): string => {
    if (bookType && bookType.toLowerCase() === 'new') return '#43a047';
    if (bookType && bookType.toLowerCase() === 'old') return '#e65100';
    return '#888';
  };

  const handleQuantityChange = (bookId: Id, delta: number, maxStock: number) => {
    setQuantities(q => {
      const newQ = { ...q };
      newQ[bookId] = Math.max(1, Math.min((newQ[bookId] || 1) + delta, maxStock));
      return newQ;
    });
  };

  const handleRemoveBook = (bookId: Id) => {
    const email = user.email;
    apiFetch(`${API_BASE_URL}/cart/remove/${bookId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
      .then(res => res.json() as Promise<Book[]>)
      .then(data => {
        setCartBooks(Array.isArray(data) ? data : []);
        setQuantities(q => {
          const nq = { ...q };
          delete nq[bookId];
          return nq;
        });
      });
  };

  const subtotal = useMemo(() => {
    return cartBooks.reduce((sum, book) => {
      const qty = quantities[book._id] || 1;
      return sum + (Number(book.price) * qty);
    }, 0);
  }, [cartBooks, quantities]);

  /*
   * A code's preview belongs to the basket it was checked against. Change a
   * quantity and it is no longer the price the server will charge - a
   * FreeDelivery basket taken under 1000 Tk would be refused - so it stops
   * counting until it is applied again, rather than showing a total that is
   * not true.
   */
  const promoCurrent = promoApplied && appliedFor === subtotal;
  const previewFree = promoCurrent && freeDelivery;

  /*
   * A preview of what the API will charge, by the same rule. It used to price
   * the whole Dhaka division as inside Dhaka - Tangail and Faridpur included -
   * and to send its figure to the server, which stored it as given. Once the
   * order is placed, what the server actually charged is shown instead.
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
   * The server says what a code is worth. The code and its discount used to
   * be written into this page, and the discount it worked out was sent with
   * the order and stored as given. The order prices the code again, so this
   * is only a preview.
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

    // Decrease stock in backend and clear cart
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
        paymentMethod: 'Cash on Delivery', // or get from state if you support more methods
        contactName: user.name,
        contactPhone: user.phone,
        deliveryDivision: division,
        deliveryDistrict: district,
        deliveryAddress: address
      })
    })
    .then(async res => ({ ok: res.ok, data: (await res.json()) as CreateOrderResponse & ApiError }))
    .then(({ ok, data }) => {
      if (ok && data.orderNumber) {
        setOrderNumber(data.orderNumber);
        // What the server actually charged, which may differ from the preview
        // if a book sold out in the meantime.
        setConfirmedCharges({ shipping: data.shippingCharge ?? 0, discount: data.discount ?? 0 });
        if (data.promoMessage) setPromoMsg(data.promoMessage);
        // Only now: the cart used to be cleared whether or not the order went
        // through, so a failed checkout threw the basket away. Through the
        // mutation rather than a bare fetch, so every header's cart badge
        // drops to zero.
        clearCart();
        // Save order info to localStorage only after receiving orderNumber
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
            cartBooks: latestCartBooks,
          })
        );
        setOrderConfirmed(true);
      } else {
        // Unfreeze, so the basket can be changed and tried again.
        setCartBooks(null);
        freezeQuantities(null);
        setConfirmError(data.message || 'Order confirmation failed. Please try again.');
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

  if (!user.email) {
    return (
      <div style={{ color: 'white', padding: '2rem', textAlign: 'center', background: '#222', minHeight: '100vh' }}>
        Please sign in to proceed to payment.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ color: '#222', padding: '2rem', textAlign: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (orderConfirmed) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100%',
        background: '#fafafa',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box'
      }}>
        {/* Checkout is two columns beside each other on a desktop and one
            column on a phone. It was two at every width: 56% of a 360px screen,
            less 96px of padding, is about 106px to fill in an address in. */}
        <div
          className="relative flex min-h-screen w-full max-w-[1100px] flex-col lg:flex-row"
          style={{ background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}
        >
          <div
            className="w-full min-w-0 p-4 sm:p-8 lg:w-[56%] lg:shrink-0 lg:p-12"
            style={{
            background: '#fff',
            borderRight: '1px solid #eee',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <button
              style={{
                position: 'absolute',
                top: 32,
                left: 48,
                background: '#ff9800',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 20px',
                fontWeight: 500,
                fontSize: 16,
                cursor: 'pointer'
              }}
              onClick={() => {
                localStorage.removeItem('confirmedOrder');
                window.removeEventListener('beforeunload', () => {});
                window.removeEventListener('popstate', () => {});
                navigate('/');
              }}
            >
              Go To Home
            </button>
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div style={{
                fontSize: 36,
                fontWeight: 700,
                color: '#222',
                textAlign: 'center',
                marginTop: 40,
                marginBottom: 40,
                letterSpacing: 1
              }}>
                Checkout Complete!<br />
                Thank You For<br />
                Your Purchase!
              </div>
              <button
                style={{
                  width: 260,
                  padding: '14px 0',
                  background: 'linear-gradient(90deg, #ff9800 0%, #e65100 100%)',
                  color: '#fff',
                  fontWeight: 500,
                  fontSize: 16,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  localStorage.removeItem('confirmedOrder');
                  window.removeEventListener('beforeunload', () => {});
                  window.removeEventListener('popstate', () => {});
                  navigate(`/order-tracking/${orderNumber}`);
                }}
                tabIndex={-1}
              >
                Track Your Order
              </button>
            </div>
          </div>
          <div style={{
            maxWidth: '44%',
            background: '#fff',
            boxShadow: 'none',
            padding: 48,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <div style={{ color: '#e65100', fontWeight: 500, fontSize: 20 }}>Order Summary</div>
              <div style={{ color: '#e65100', fontWeight: 500, fontSize: 18 }}>#{orderNumber}</div>
            </div>
            <div
              style={{
                marginBottom: 16,
                borderBottom: '1px solid #eee',
                paddingBottom: 8
              }}
            >
              {cartBooks.map(book => (
                <div key={book._id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 18
                }}>
                  <div style={{ position: 'relative', marginRight: 14 }}>
                    <img
                      loading="lazy"
                      decoding="async" src={getBookImageSrc(book)} alt={book.title} style={{
                      width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee'
                    }} />
                    {book.bookType && (
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        background: getStickerColor(book.bookType),
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 13,
                        padding: '1px 7px',
                        borderRadius: 8,
                        letterSpacing: 1,
                        zIndex: 2
                      }}>
                        {book.bookType.toLowerCase() === 'new' ? 'NEW' : 'OLD'}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{book.title}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>By {book.author}</div>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'right', fontSize: 15 }}>
                    Quantity: <span style={{ fontWeight: 600 }}>{quantities[book._id] || 1}</span>
                  </div>
                  <div style={{ minWidth: 90, textAlign: 'right', fontWeight: 600, fontSize: 15, marginLeft: 12 }}>
                    {(Number(book.price) * (quantities[book._id] || 1)).toFixed(2)} Tk.
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#888' }}>Subtotal</span>
                <span style={{ color: '#888' }}>{subtotal.toFixed(2)} Tk.</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#888' }}>Shipping</span>
                <span style={{ color: '#888' }}>{shippingLabel}</span>
              </div>
              {shownDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: '#888' }}>Discount{promo ? ` (${promo})` : ''}</span>
                  <span style={{ color: '#888' }}>-{shownDiscount.toFixed(2)} Tk.</span>
                </div>
              )}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 700,
              fontSize: 18,
              marginTop: 8
            }}>
              <span>Total</span>
              <span style={{ color: '#222' }}>{total.toFixed(2)} Tk.</span>
            </div>
            <div style={{
              marginTop: 18,
              fontWeight: 500,
              color: '#e65100',
              fontSize: 16
            }}>
              Payment Method: <span style={{ color: '#222', fontWeight: 600 }}>Cash On Delivery</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#fafafa',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: 0,
      margin: 0,
      boxSizing: 'border-box'
    }}>
      {/* Checkout is two columns beside each other on a desktop and one
          column on a phone. It was two at every width: 56% of a 360px screen,
          less 96px of padding, is about 106px to fill in an address in. */}
      <div
        className="relative flex min-h-screen w-full max-w-[1100px] flex-col lg:flex-row"
        style={{ background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}
      >
        <div
          className="w-full min-w-0 p-4 sm:p-8 lg:w-[56%] lg:shrink-0 lg:p-12"
          style={{
          background: '#fff',
          borderRight: '1px solid #eee',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start'
        }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* A span with a tabIndex could be focused and then did nothing
                on Enter. A button is focusable and works. */}
            <button
              type="button"
              className="icon-button"
              style={{ fontSize: 32, fontWeight: 700 }}
              onClick={() => navigate('/cart')}
              title="Go back to cart"
              aria-label="Go back to cart"
            >&larr;</button>
            <h2 style={{ margin: 0, fontWeight: 700, fontSize: 32, color: '#e65100', userSelect: 'none' }}>Checkout</h2>
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: '#e65100', fontWeight: 500, marginBottom: 8 }}>Payment Method</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#e65100',
                marginRight: 8
              }}></span>
              <span>Cash On Delivery</span>
            </div>
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: '#e65100', fontWeight: 500, marginBottom: 8 }}>Contact Information</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <input
                placeholder="Name"
                value={user.name}
                onChange={e => handleUserChange('name', e.target.value)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <input
                placeholder="Email Address"
                value={user.email}
                onChange={e => handleUserChange('email', e.target.value)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
              />
              <input
                placeholder="Phone Number"
                type="number"
                value={user.phone}
                onChange={e => handleUserChange('phone', e.target.value)}
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
                onWheel={e => e.currentTarget.blur()}
                min="0"
                pattern="[0-9]*"
              />
            </div>
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: '#e65100', fontWeight: 500, marginBottom: 8 }}>Delivery Information</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <select
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
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
              <select
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
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
            <textarea
              placeholder="Please write detailed address"
              rows={3}
              value={address}
              onChange={e => setAddress(e.target.value)}
              style={{
                width: '100%',
                padding: 10,
                border: '1px solid #ddd',
                borderRadius: 4,
                resize: 'none'
              }}
            />
          </div>
          <button style={{
            width: '100%',
            padding: '14px 0',
            background: 'linear-gradient(90deg, #ff9800 0%, #e65100 100%)',
            color: '#fff',
            fontWeight: 500,
            fontSize: 16,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            marginTop: 16
          }}
            onClick={handleConfirmOrder}
          >
            Confirm Order
          </button>
          {confirmError && (
            <div style={{ color: '#e74c3c', marginTop: 12, fontWeight: 500, textAlign: 'center' }}>
              {confirmError}
            </div>
          )}
        </div>
        <div
          className="flex w-full min-w-0 flex-col justify-start p-4 sm:p-8 lg:w-[44%] lg:shrink-0 lg:p-12"
          style={{ background: '#fff', boxSizing: 'border-box' }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
          }}>
            <div style={{ color: '#e65100', fontWeight: 500 }}>Your Order</div>
            {orderConfirmed && <div style={{ color: '#e65100', fontWeight: 500 }}>#{orderNumber}</div>}
          </div>
          <div style={{
            maxHeight: 260,
            overflowY: 'auto',
            borderBottom: '1px solid #eee',
            marginBottom: 16,
            paddingBottom: 8
          }}>
            {cartBooks.length === 0 ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>No books in cart.</div>
            ) : (
              cartBooks.map(book => (
                <div key={book._id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 16
                }}>
                  {/* `shrink-0`: in a flex row on a 360px screen the cover was
                      squeezed to nothing and its NEW badge, positioned against
                      it, landed on top of the book's title. */}
                  <div className="shrink-0" style={{ position: 'relative', marginRight: 12 }}>
                    <img
                      loading="lazy"
                      decoding="async" src={getBookImageSrc(book)} alt={book.title} style={{
                      width: 48, height: 48, objectFit: 'cover', borderRadius: 4
                    }} />
                    {book.bookType && (
                      <span style={{
                        position: 'absolute',
                        top: 2,
                        left: 2,
                        background: getStickerColor(book.bookType),
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 12,
                        padding: '1px 6px',
                        borderRadius: 7,
                        letterSpacing: 1,
                        zIndex: 2
                      }}>
                        {book.bookType.toLowerCase() === 'new' ? 'NEW' : 'OLD'}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{book.title}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>By {book.author}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: '1px solid #ccc',
                        background: '#fff',
                        color: '#e65100',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        fontSize: 18,
                        lineHeight: 1
                      }}
                      onClick={() => handleQuantityChange(book._id, -1, book.stock)}
                      disabled={quantities[book._id] <= 1}
                      aria-label="Decrease quantity"
                    >-</button>
                    <div style={{ minWidth: 24, textAlign: 'center' }}>{quantities[book._id] || 1}</div>
                    <button
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: '1px solid #ccc',
                        background: '#fff',
                        color: '#e65100',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        fontSize: 18,
                        lineHeight: 1
                      }}
                      onClick={() => handleQuantityChange(book._id, 1, book.stock)}
                      disabled={quantities[book._id] >= book.stock}
                      aria-label="Increase quantity"
                    >+</button>
                  </div>
                  <div style={{ width: 80, textAlign: 'right', marginLeft: 12 }}>
                    <div style={{ fontWeight: 500 }}>
                      {(Number(book.price) * (quantities[book._id] || 1)).toFixed(2)} TK.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ color: '#e74c3c', marginLeft: 8, fontSize: 18 }}
                    onClick={() => handleRemoveBook(book._id)}
                    title="Remove from cart"
                    aria-label="Remove from cart"
                  >&#128465;</button>
                </div>
              ))
            )}
          </div>
          <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }}></div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>Subtotal</span>
              <span style={{ color: '#888' }}>{subtotal.toFixed(2)} TK.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>Shipping</span>
              <span style={{ color: '#888' }}>{shippingLabel}</span>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888', lineHeight: 1.4 }}>
              {site.delivery.insideDhaka} Tk inside Dhaka, {site.delivery.outsideDhaka} Tk elsewhere,
              free with {freeDeliveryPromo.code} on {freeDeliveryPromo.minBooksTotal} Tk or more. By courier
              in {site.delivery.daysInsideDhaka} working days in Dhaka, {site.delivery.daysOutsideDhaka} elsewhere.
              {' '}{site.payment}.
            </p>
            {shownDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#888' }}>Discount</span>
                <span style={{ color: '#888' }}>-{shownDiscount.toFixed(2)} TK.</span>
              </div>
            )}
            {/*
              Hidden while no promotion is running: a code box that can only
              ever say "not valid" invites a shopper to go hunting for a code
              that does not exist. The rules are in server/config/promotions.ts.
            */}
            {site.promoCodes && (
            <div>
              {/*
                The moment it applies, not buried in the terms: a code nobody
                hears about gives nobody free delivery.
              */}
              {couldHaveFreeDelivery && (
                <p role="note" style={{
                  margin: '8px 0 0',
                  padding: '8px 10px',
                  background: '#fff8e1',
                  border: '1px solid #ffe082',
                  borderRadius: 4,
                  fontSize: 13,
                  color: '#5d4037',
                }}>
                  Your books come to {freeDeliveryPromo.minBooksTotal} Tk or more: use the code{' '}
                  <strong>{freeDeliveryPromo.code}</strong> for free delivery
                  {promoCurrent ? ' instead - one code per order.' : '.'}
                </p>
              )}
              <label htmlFor="promo-code" style={{ display: 'block', marginTop: 8, fontSize: 13, color: '#888' }}>
                Promo code or voucher
              </label>
              <input
                id="promo-code"
                value={promo}
                onChange={e => { setPromo(e.target.value); setPromoMsg(''); setPromoApplied(false); setDiscount(0); setFreeDelivery(false); }}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: 8,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
                onKeyDown={e => { if (e.key === 'Enter') void handleApplyPromo(); }}
                disabled={promoCurrent}
              />
              <button
                style={{
                  marginTop: 8,
                  padding: '6px 16px',
                  background: '#e65100',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontWeight: 500,
                  marginLeft: 4
                }}
                onClick={() => void handleApplyPromo()}
                disabled={promoCurrent}
              >Apply</button>
              {promoApplied && (
                <button
                  style={{
                    marginTop: 8,
                    padding: '6px 16px',
                    background: '#e74c3c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 500,
                    marginLeft: 8
                  }}
                  onClick={handleRemovePromo}
                >Remove</button>
              )}
              {promoApplied && !promoCurrent ? (
                <div role="status" style={{ marginTop: 6, color: '#e65100', fontSize: 13 }}>
                  Your basket changed. Apply the code again to use it.
                </div>
              ) : promoMsg && (
                <div role="status" style={{
                  marginTop: 6,
                  color: promoCurrent ? 'green' : '#e74c3c',
                  fontSize: 13
                }}>{promoMsg}</div>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>
                First order? <strong>{firstOrder.code}</strong>: {firstOrder.description}.
              </p>
            </div>
            )}
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 600,
            fontSize: 18
          }}>
            <span>Total</span>
            <span style={{ color: '#222' }}>{total.toFixed(2)} TK.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
