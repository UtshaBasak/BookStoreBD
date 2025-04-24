import express from 'express';
import { MongoServerClosedError } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
dotenv.config();

// MongoDB connection
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected');
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

// Configure CORS
const corsOptions = {
    origin: 'http://localhost:5173', // Allow requests from this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
    credentials: true, // Allow cookies if needed
};

const app = express();
import userRouter from './routes/user.route.js';
import authRouter from './routes/auth.route.js';
import bookRouter from './routes/book.route.js';

app.use(bodyParser.json());

app.use(express.json());
app.use(cors(corsOptions));
app.use('/user',userRouter);
app.use('/auth',authRouter);
app.use('/book', bookRouter);

app.use((err,req,res,next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internet Server Error';
    return res.status(statusCode).json({
        success:false,
        statusCode,
        message,
    });
});

app.get('/wishlist', async (req, res) => {
    try {
        const wishlist = await Bookdetails.find({ isinwishlist: true });

        console.log("Wishlist books fetched:", wishlist);
        res.status(200).json(wishlist);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
app.get('/wishlist/delete/:id', async (req, res) => {
    try {
        console.log("Deleting from wishlist, ID:", req.params.id);

        const updatedBook = await Bookdetails.findByIdAndUpdate(
            req.params.id,
            { $set: { isinwishlist: false } },  
            { new: true }  
        );

        console.log("Updated book:", updatedBook);

        if (!updatedBook) {
            return res.status(404).json({ message: 'Book not found' });
        }

        const wishlist = await Bookdetails.find({ isinwishlist: true });
        res.status(200).json(wishlist);
    } catch (error) {
        console.error("Error:", error);  
        res.status(500).json({ message: error.message });
    }
});

const port = process.env.PORT || 1015;
app.listen(port,()=> console.log(`Listening on port ${port}...`));
