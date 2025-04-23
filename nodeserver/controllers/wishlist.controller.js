import AddBook from '../models/AddBook.model.js';

export const Wishlist = async (req, res) => {
    try {
        const wishlist = await AddBook.find({ isinwishlist: 1 });

        console.log("Wishlist books fetched:", wishlist);
        res.status(200).json(wishlist);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const Wishlist_delete = async (req, res) => {
    try {
        console.log("Deleting from wishlist, ID:", req.params.id);

        const updatedBook = await AddBook.findByIdAndUpdate(
            req.params.id,
            { $set: { isinwishlist: 0 } },  
            { new: true }  
        );

        console.log("Updated book:", updatedBook);

        if (!updatedBook) {
            return res.status(404).json({ message: 'Book not found' });
        }

        const wishlist = await AddBook.find({ isinwishlist: 1 });
        res.status(200).json(wishlist);
    } catch (error) {
        console.error("Error:", error);  
        res.status(500).json({ message: error.message });
    }
};

