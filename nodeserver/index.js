import express from 'express';
import { MongoServerClosedError } from 'mongodb';
import Bookdetails from './bookdetails.model.js';
import cors from 'cors';



const app = express();
import mongoose from 'mongoose';
import userRouter from './routes/user.route.js';

import authRouter from './routes/auth.route.js';



app.use(express.json());
app.use(cors());
app.use('/user',userRouter);
app.use('/auth',authRouter);


    

app.use((err,req,res,next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internet Server Error';
    return res.status(statusCode).json({
        success:false,
        statusCode,
        message,

    });
});
 

app.get('/booklist',async(req,res) => {
    try{
        const bookdetails = await Bookdetails.find({});
        //const bookdetails = await db.BookListTable.find({});
        console.log("Books fetched:", bookdetails);
        res.status(200).json(bookdetails);
    } catch (error) {
        res.status(500).json({message: error.message});
    }

});


app.post('/booklist/filter', async (req, res) => {
    const { filter_key, filter_input } = req.body;

    try {
        const filter = {};
        filter[filter_key] = filter_input;

        const filteredBooks = await Bookdetails.find(filter);
        console.log(filteredBooks);
        res.status(200).json(filteredBooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});



app.post('/booklist/search', async (req, res) => {
    const { search_input } = req.body;

    try {
        const searchedBooks = await Bookdetails.find({
            title: { $regex: search_input, $options: 'i' } // 'i' for case-insensitive
        });

        console.log(searchedBooks);
        res.status(200).json(searchedBooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
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

mongoose.connect("***REMOVED***")
.then(() =>{
    console.log("Connected to database!");
})
.catch(() =>{
    console.log("Connection failed!");
});

