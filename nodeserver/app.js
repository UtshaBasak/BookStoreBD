import express from 'express';
import cors from 'cors';
import orderRoutes from './routes/order.routes.js'; // adjust path if needed

const app = express();

// MIDDLEWARES
app.use(cors());
app.use(express.json()); // <-- 🚨 YOU NEED THIS LINE
app.use(express.urlencoded({ extended: true })); // (optional) for parsing form-data (x-www-form-urlencoded)

// ROUTES
app.use('/orders', orderRoutes); // mount your order routes here

// Start server
app.listen(1015, () => {
  console.log('Server running on port 1015');
});
