import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const PROMO_CODE = 'BookStore';
const PROMO_DISCOUNT = 50.00;

const getUserProfile = () => {
  return {
    name: localStorage.getItem('username') || '',
    email: localStorage.getItem('userEmail') || '',
    phone: localStorage.getItem('userPhone') || '',
    isFirstOrder: localStorage.getItem('isFirstOrder') !== 'false',
  };
};

const setFirstOrderUsed = () => {
  localStorage.setItem('isFirstOrder', 'false');
};

export default function Payment() {
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: '', email: '', phone: '', isFirstOrder: true });
  const [division, setDivision] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [promo, setPromo] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [orderNumber, setOrderNumber] = useState('');
  const [cartBooks, setCartBooks] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const divisions = [
    "Dhaka", "Chattogram", "Khulna", "Rajshahi", "Barisal", "Sylhet", "Rangpur", "Mymensingh"
  ];
  const divisionDistricts = {
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
    const profile = getUserProfile();
    setUser(profile);

    // Fetch latest profile from backend to get updated phone
    if (profile.email) {
      fetch(`https://bookstorebd.onrender.com/user/profile?email=${encodeURIComponent(profile.email)}`)
        .then(res => res.json())
        .then(data => {
          setUser(u => ({
            ...u,
            name: data.username || u.name,
            phone: data.phone || u.phone,
          }));
          // Optionally update localStorage for consistency
          if (data.phone) localStorage.setItem('userPhone', data.phone);
          if (data.username) localStorage.setItem('username', data.username);
        })
        .catch(() => {});
    }

    const email = profile.email;
    if (!email) {
      setCartBooks([]);
      setLoading(false);
      return;
    }

    // Restore confirmed order if present
    const orderDataRaw = localStorage.getItem('confirmedOrder');
    if (orderDataRaw) {
      try {
        const orderData = JSON.parse(orderDataRaw);
        if (orderData && orderData.email === email) {
          setOrderConfirmed(true);
          setOrderNumber(orderData.orderNumber);
          setDivision(orderData.division);
          setDistrict(orderData.district);
          setAddress(orderData.address);
          setDiscount(orderData.discount);
          setPromo(orderData.promo);
          setPromoApplied(orderData.promoApplied);
          setQuantities(orderData.quantities || {});
          setCartBooks(orderData.cartBooks || []);
          setLoading(false);
          return;
        }
      } catch (error) {
        // Ignore JSON parse errors from invalid localStorage data
        console.debug('Failed to parse order data:', error);
      }
    }

    // If not confirmed, load cart as usual
    fetch(`https://bookstorebd.onrender.com/cart?email=${encodeURIComponent(email)}`)
      .then(res => res.json())
      .then(data => {
        setCartBooks(Array.isArray(data) ? data : []);
        const q = {};
        (Array.isArray(data) ? data : []).forEach(book => { q[book._id] = 1; });
        setQuantities(q);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const onStorage = () => setUser(getUserProfile());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (!email) return;
    const orderDataRaw = localStorage.getItem('confirmedOrder');
    if (orderDataRaw) {
      try {
        const orderData = JSON.parse(orderDataRaw);
        if (orderData && orderData.email === email) {
          setOrderConfirmed(true);
          setOrderNumber(orderData.orderNumber);
          setDivision(orderData.division);
          setDistrict(orderData.district);
          setAddress(orderData.address);
          setDiscount(orderData.discount);
          setPromo(orderData.promo);
          setPromoApplied(orderData.promoApplied);
          setQuantities(orderData.quantities || {});
          setCartBooks(orderData.cartBooks || []);
        }
      } catch (error) {
        // Ignore JSON parse errors from invalid localStorage data
        console.debug('Failed to parse order data:', error);
      }
    }
  }, []);

  const getBookImageSrc = (book) => {
    const img = book.images?.[0];
    if (!img) return 'https://via.placeholder.com/80x120?text=No+Image';
    if (img.startsWith('data:image/')) return img;
    if (/^https?:\/\//.test(img)) return img;
    return `https://bookstorebd.onrender.com/uploads/${img}`;
  };

  // Helper for sticker color
  const getStickerColor = (bookType) => {
    if (bookType && bookType.toLowerCase() === 'new') return '#43a047';
    if (bookType && bookType.toLowerCase() === 'old') return '#e65100';
    return '#888';
  };

  const handleQuantityChange = (bookId, delta, maxStock) => {
    setQuantities(q => {
      const newQ = { ...q };
      newQ[bookId] = Math.max(1, Math.min((newQ[bookId] || 1) + delta, maxStock));
      return newQ;
    });
  };

  const handleRemoveBook = (bookId) => {
    const email = user.email;
    fetch(`https://bookstorebd.onrender.com/cart/remove/${bookId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
      .then(res => res.json())
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

  const shipping = useMemo(() => {
    if (subtotal >= 1000) return 0.00;
    if (division === 'Dhaka') return 70.00;
    return 100.00;
  }, [subtotal, division]);

  const handleApplyPromo = () => {
    if (promoApplied) return;
    if (promo === PROMO_CODE) {
      setDiscount(PROMO_DISCOUNT);
      setPromoMsg('Promo code applied: 50.00 TK. discount!');
      setPromoApplied(true);
    } else {
      setDiscount(0);
      setPromoMsg('Invalid promo code.');
    }
  };

  const handleRemovePromo = () => {
    setPromo('');
    setPromoMsg('');
    setPromoApplied(false);
    setDiscount(0);
  };

  const total = useMemo(() => {
    return Math.max(0, subtotal + shipping - discount);
  }, [subtotal, shipping, discount]);

  const handleUserChange = (field, value) => {
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
      setPromoMsg('Please fill all contact and delivery information fields.');
      return;
    }
    if (cartBooks.length === 0) {
      setConfirmError('You must add at least one book to confirm your order.');
      return;
    }

    // Always use the current UI quantities for the books in cart
    const latestCartBooks = [...cartBooks];
    const latestQuantities = {};
    latestCartBooks.forEach(book => {
      latestQuantities[book._id] = quantities[book._id] || 1;
    });

    setCartBooks(latestCartBooks);
    setQuantities(latestQuantities);

    // Decrease stock in backend and clear cart
    fetch(`https://bookstorebd.onrender.com/order/decrease-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: latestCartBooks.map(book => ({
          bookId: book._id,
          quantity: latestQuantities[book._id] || 1
        })),
        email: user.email,
        shippingCharge: shipping,
        discount: discount,
        promo: promo,
        promoApplied: promoApplied,
        paymentMethod: 'Cash on Delivery', // or get from state if you support more methods
        contactName: user.name,
        contactPhone: user.phone,
        deliveryDivision: division,
        deliveryDistrict: district,
        deliveryAddress: address
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.orderNumber) {
        setOrderNumber(data.orderNumber);
        // Save order info to localStorage only after receiving orderNumber
        localStorage.setItem(
          'confirmedOrder',
          JSON.stringify({
            email: user.email,
            orderNumber: data.orderNumber,
            division,
            district,
            address,
            discount,
            promo,
            promoApplied,
            quantities: latestQuantities,
            cartBooks: latestCartBooks,
          })
        );
        setOrderConfirmed(true);
      } else {
        setConfirmError('Order confirmation failed. Please try again.');
      }
    });

    // Clear the cart for the user after order confirmation
    fetch(`https://bookstorebd.onrender.com/cart/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email })
    });

    if (promoApplied && promo === PROMO_CODE && user.isFirstOrder) {
      setFirstOrderUsed();
      setUser(u => ({ ...u, isFirstOrder: false }));
    }
  };

  useEffect(() => {
    if (!orderConfirmed) return;
    const blockNav = (e) => {
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
        width: '100vw',
        background: '#fafafa',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box'
      }}>
        <div style={{
          width: '100%',
          maxWidth: 1100,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'row',
          background: '#fff',
          boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
          borderRadius: 0,
          margin: 0,
          padding: 0,
          position: 'relative'
        }}>
          <div style={{
            flex: '0 0 56%',
            minWidth: 0,
            maxWidth: '56%',
            padding: 48,
            background: '#fff',
            borderRadius: '0',
            boxShadow: 'none',
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
                    <img src={getBookImageSrc(book)} alt={book.title} style={{
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
                        fontSize: 11,
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
                <span style={{ color: '#888' }}>{shipping.toFixed(2)} Tk.</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#888' }}>Discount</span>
                <span style={{ color: '#888' }}>-{discount.toFixed(2)} Tk.</span>
              </div>
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
      width: '100vw',
      background: '#fafafa',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: 0,
      margin: 0,
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 1100,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'row',
        background: '#fff',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
        borderRadius: 0,
        margin: 0,
        padding: 0,
        position: 'relative'
      }}>
        <div style={{
          flex: '0 0 56%',
          minWidth: 0,
          maxWidth: '56%',
          padding: 48,
          background: '#fff',
          borderRadius: '0',
          boxShadow: 'none',
          borderRight: '1px solid #eee',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start'
        }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{ fontSize: 36, fontWeight: 700, cursor: 'pointer' }}
              onClick={() => navigate('/cart')}
              title="Go back to cart"
              tabIndex={0}
              role="button"
            >&larr;</span>
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
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
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
            <div style={{ display: 'flex', gap: 16 }}>
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
                onWheel={e => e.target.blur()}
                min="0"
                pattern="[0-9]*"
              />
            </div>
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: '#e65100', fontWeight: 500, marginBottom: 8 }}>Delivery Information</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
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
                {division && divisionDistricts[division].map(dist => (
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
        <div style={{
          flex: '0 0 44%',
          minWidth: 0,
          maxWidth: '44%',
          background: '#fff',
          borderLeft: 'none',
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
                  <div style={{ position: 'relative', marginRight: 12 }}>
                    <img src={getBookImageSrc(book)} alt={book.title} style={{
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
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 7,
                        letterSpacing: 1,
                        zIndex: 2
                      }}>
                        {book.bookType.toLowerCase() === 'new' ? 'NEW' : 'OLD'}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{book.title}</div>
                    <div style={{ fontSize: 13, color: '#888' }}>By {book.author}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      style={{
                        width: 24,
                        height: 24,
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
                        width: 24,
                        height: 24,
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
                  <span
                    style={{ color: '#e74c3c', cursor: 'pointer', marginLeft: 8, fontSize: 18 }}
                    onClick={() => handleRemoveBook(book._id)}
                    title="Remove from cart"
                    role="button"
                    aria-label="Remove from cart"
                  >&#128465;</span>
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
              <span style={{ color: '#888' }}>{shipping.toFixed(2)} TK.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>Discount</span>
              <span style={{ color: '#888' }}>-{discount.toFixed(2)} TK.</span>
            </div>
            <div>
              <input
                placeholder="Enter Promo Code or Voucher Here"
                value={promo}
                onChange={e => { setPromo(e.target.value); setPromoMsg(''); setPromoApplied(false); setDiscount(0); }}
                style={{
                  width: '100%',
                  marginTop: 8,
                  padding: 8,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
                onKeyDown={e => { if (e.key === 'Enter') handleApplyPromo(); }}
                disabled={promoApplied}
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
                onClick={handleApplyPromo}
                disabled={promoApplied}
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
              {promoMsg && (
                <div style={{
                  marginTop: 6,
                  color: promoMsg.startsWith('Promo code applied') ? 'green' : '#e74c3c',
                  fontSize: 13
                }}>{promoMsg}</div>
              )}
            </div>
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
