import React, { useState } from 'react';

const divisions = [
  {
    name: 'Dhaka',
    districts: [
      'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur', 'Manikganj', 'Munshiganj',
      'Narayanganj', 'Narsingdi', 'Rajbari', 'Shariatpur', 'Tangail'
    ]
  },
  {
    name: 'Chittagong',
    districts: [
      'Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', "Cox's Bazar", 'Cumilla', 'Feni',
      'Khagrachari', 'Lakshmipur', 'Noakhali', 'Rangamati'
    ]
  },
  {
    name: 'Khulna',
    districts: [
      'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia', 'Magura', 'Meherpur',
      'Narail', 'Satkhira'
    ]
  },
  {
    name: 'Rajshahi',
    districts: [
      'Bogura', 'Joypurhat', 'Naogaon', 'Natore', 'Chapainawabganj', 'Pabna', 'Rajshahi', 'Sirajganj'
    ]
  },
  {
    name: 'Barisal',
    districts: [
      'Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur'
    ]
  },
  {
    name: 'Sylhet',
    districts: [
      'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet'
    ]
  },
  {
    name: 'Rangpur',
    districts: [
      'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari', 'Panchagarh', 'Rangpur', 'Thakurgaon'
    ]
  },
  {
    name: 'Mymensingh',
    districts: [
      'Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur'
    ]
  }
];

const Payment = () => {
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const handleDivisionChange = (e) => {
    setSelectedDivision(e.target.value);
    setSelectedDistrict('');
  };

  const handleDistrictChange = (e) => {
    setSelectedDistrict(e.target.value);
  };

  const districts =
    divisions.find((d) => d.name === selectedDivision)?.districts || [];

  return (
    <div style={{
      background: '#f5f5f5',
      minHeight: '100vh',
      width: '100vw',
      padding: 0,
      margin: 0,
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0,
        alignItems: 'stretch',
        justifyContent: 'stretch'
      }}>
        {/* Left Column */}
        <div style={{
          flex: '0 0 60%',
          minWidth: 0,
          padding: 40,
          background: '#fff',
          borderRadius: '0 0 0 0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 36, cursor: 'pointer', fontWeight: 700 }}>&larr;</span>
            <h2 style={{ margin: 0, fontWeight: 700, fontSize: 32 }}>Checkout</h2>
          </div>
          {/* Payment Method */}
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
          {/* Contact Information */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ color: '#e65100', fontWeight: 500, marginBottom: 8 }}>Contact Information</div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <input placeholder="Name" style={{
                flex: 1,
                padding: 10,
                border: '1px solid #ddd',
                borderRadius: 4
              }} />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <input placeholder="Email Address" style={{
                flex: 1,
                padding: 10,
                border: '1px solid #ddd',
                borderRadius: 4
              }} />
              <input
                placeholder="Phone Number"
                type="number"
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
                onWheel={e => e.target.blur()} // Prevent scroll changing value
                min="0"
                pattern="[0-9]*"
              />
            </div>
          </div>
          {/* Delivery Information */}
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
                value={selectedDivision}
                onChange={handleDivisionChange}
              >
                <option value="">
                  Select Division
                </option>
                {selectedDivision && (
                  <option value={selectedDivision}>
                    Division: {selectedDivision}
                  </option>
                )}
                {divisions
                  .filter(div => div.name !== selectedDivision)
                  .map((div) => (
                    <option key={div.name} value={div.name}>{div.name}</option>
                  ))}
              </select>
              <select
                style={{
                  flex: 1,
                  padding: 10,
                  border: '1px solid #ddd',
                  borderRadius: 4
                }}
                value={selectedDistrict}
                onChange={handleDistrictChange}
                disabled={!selectedDivision}
              >
                <option value="">
                  {selectedDivision ? 'Select District' : 'Select District'}
                </option>
                {selectedDistrict && (
                  <option value={selectedDistrict}>
                    District: {selectedDistrict}
                  </option>
                )}
                {selectedDivision && districts
                  .filter(district => district !== selectedDistrict)
                  .map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
              </select>
            </div>
            <textarea placeholder="Please write detailed address" rows={3} style={{
              width: '100%',
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 4,
              resize: 'none'
            }} />
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
          }}>
            Proceed to Payment
          </button>
        </div>
        {/* Right Column */}
        <div style={{
          flex: '0 0 40%',
          maxWidth: '100%',
          minWidth: 340,
          background: '#fff',
          borderLeft: '1px solid #eee',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          padding: 32,
          boxSizing: 'border-box'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16
          }}>
            <div style={{ color: '#e65100', fontWeight: 500 }}>Your Order</div>
            <div style={{ color: '#e65100', fontWeight: 500 }}>#12013088</div>
          </div>
          {/* Order Items */}
          <div>
            {/* Item 1 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <img src="https://i.imgur.com/1.jpg" alt="Dayei" style={{
                width: 48, height: 48, objectFit: 'cover', borderRadius: 4, marginRight: 12
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Dayei</div>
                <div style={{ fontSize: 13, color: '#888' }}>By Humayun Ahmed</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#888' }}>Quantity</div>
                <div>2</div>
              </div>
              <div style={{ width: 80, textAlign: 'right', marginLeft: 12 }}>
                <div style={{ fontWeight: 500 }}>900.00 Tk.</div>
              </div>
              <span style={{ color: '#e65100', cursor: 'pointer', marginLeft: 8 }}>&#128465;</span>
            </div>
            {/* Item 2 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <img src="https://i.imgur.com/2.jpg" alt="Songogtok" style={{
                width: 48, height: 48, objectFit: 'cover', borderRadius: 4, marginRight: 12
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Songogtok</div>
                <div style={{ fontSize: 13, color: '#888' }}>By Shahidullah Kaiser</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#888' }}>Quantity</div>
                <div>1</div>
              </div>
              <div style={{ width: 80, textAlign: 'right', marginLeft: 12 }}>
                <div style={{ fontWeight: 500 }}>350.00 Tk.</div>
              </div>
              <span style={{ color: '#e65100', cursor: 'pointer', marginLeft: 8 }}>&#128465;</span>
            </div>
            {/* Item 3 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 16
            }}>
              <img src="https://i.imgur.com/3.jpg" alt="Adarsha Hindu Hotel" style={{
                width: 48, height: 48, objectFit: 'cover', borderRadius: 4, marginRight: 12
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>Adarsha Hindu Hotel</div>
                <div style={{ fontSize: 13, color: '#888' }}>By Bibhutibhushan Bandopadhyay</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, color: '#888' }}>Quantity</div>
                <div>1</div>
              </div>
              <div style={{ width: 80, textAlign: 'right', marginLeft: 12 }}>
                <div style={{ fontWeight: 500 }}>350.00 Tk.</div>
              </div>
              <span style={{ color: '#e65100', cursor: 'pointer', marginLeft: 8 }}>&#128465;</span>
            </div>
          </div>
          {/* Order Summary */}
          <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }}></div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>Subtotal</span>
              <span style={{ color: '#888' }}>1600.00 Tk.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>Shipping</span>
              <span style={{ color: '#888' }}>100.00 Tk.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#888' }}>Discount</span>
              <span style={{ color: '#888' }}>-0.00 Tk.</span>
            </div>
            <input
              placeholder="Enter Promo Code or Voucher Here"
              style={{
                width: '100%',
                marginTop: 8,
                padding: 8,
                border: '1px solid #ddd',
                borderRadius: 4
              }}
            />
          </div>
          <div style={{ borderTop: '1px solid #eee', margin: '16px 0' }}></div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontWeight: 600,
            fontSize: 18
          }}>
            <span>Total</span>
            <span style={{ color: '#222' }}>1700.00 Tk.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Payment;
