import mongoose from 'mongoose';


const BookSchema = mongoose.Schema(
    {
        title:{
            type:String, required:true,
        },

        author:{
            type:String,
        },

        booktype:{
            type:String,
        },

        genre:{
            type:String,
        },

    }
);

const Bookdetails = mongoose.model("BookListTable", BookSchema);
export default Bookdetails;