import AddBook from '../models/AddBook.model.js';

export const Booklist = async(req,res) => {
    try{
        const booklist = await AddBook.find({}); 
        console.log("Books fetched:", booklist);
        res.status(200).json(booklist);
    } catch (error) {
        res.status(500).json({message: error.message});
    }

};

export const Booklist_filter = async (req, res) => {
    const { filter_key, filter_input } = req.body;

    try {
        const filter = {};
        filter[filter_key] = filter_input;

        const filteredBooks = await AddBook.find(filter);
        console.log(filteredBooks);
        res.status(200).json(filteredBooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const Booklist_search = async (req, res) => {
    const { search_input } = req.body;

    try {
        const searchedBooks = await AddBook.find({
            title: { $regex: search_input, $options: 'i' } // 'i' for case-insensitive
        });

        console.log(searchedBooks);
        res.status(200).json(searchedBooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



