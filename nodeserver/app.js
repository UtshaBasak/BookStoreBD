import express from 'express';
import cors from 'cors';

import orderRoutes from './routes/order.routes.js'; // adjust path if needed

const app = express();

// MIDDLEWARES
app.use(cors({
  origin: ['http://localhost:5173', 'https://bookstorebd.vercel.app/'], 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));


app.use(express.json()); // <-- 🚨 YOU NEED THIS LINE
app.use(express.urlencoded({ extended: true })); // (optional) for parsing form-data (x-www-form-urlencoded)

// ROUTES
import orderRoutes from './routes/order.route.js';
app.use('/order', orderRoutes);

// Start server
app.listen(4000, () => {
  console.log('Server running on port 4000');
});
