# 📚 BookStoreBD

A full-featured **BookStoreBD** with authentication, role-based access (Admin, Seller, Buyer), cart & wishlist, order tracking, real-time chat, and protected routes.  


### 🌐 Website Link: https://bookstorebd.vercel.app 

---

## 🚀 Features

### 🔑 Authentication & Access
- Email/password sign in & sign up  
- Protected routes with public-only guards  
- Role-based access (Admin, Seller, Buyer)  
- Simple admin gate (by email) with redirects
- Email verification

### 📖 Catalog
- Browse and filter books  
- Add seller listings  
- Book description form (title, author, price, category, etc.)  
- Image and metadata support  

### 🛒 Buyer Flows
- Wishlist management  
- Cart and checkout (payment stub)  
- Buyer order list  
- Order tracking via order number  

### 🏪 Seller Flows
- Seller’s own book listings  
- Seller orders list  
- Seller order tracking  

### 🛠️ Admin Panel
- Users management panel  
- Admin order tracking
- Return book management
- Admin-only routes (guarded at router level)  

### 💬 Real-Time Chat
- Buyer–Seller messaging using **Socket.IO**  
- Connect, message listeners, and cleanup handlers  
- Live order status updates  

---

## 🛠️ Tech Stack

**Frontend** : React
  
**Backend**  : Node.js & Express (REST API)
  
**Database**  : MongoDB with Mongoose

**Realtime**  : socket.io-client (frontend), socket.io (backend)  

---
## 📂 Project Structure
```
MERNBOOKSTORE/
├── client/ # React frontend
│ ├── src/
│ │ ├── assets/
│ │ ├── components/
│ │ ├── pages/
│ │ ├── styles/
│ │ └── utils/
│ └── package.json
│
├── nodeserver/ # Backend
│ ├── controllers/
│ ├── middlewares/
│ ├── models/
│ ├── routes/
│ └── package.json
│
└── README.md
```

