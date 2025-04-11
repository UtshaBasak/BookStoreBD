import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
    {
        username:{
            type:String,
            required:true,
            unique:true,
        },

        email:{
            type:String,
            required:true,
            unique:true,
        },

        password:{
            type:String,
            required:true,
            unique:true,
        },

        

    }, {timestamps: true}
);
const User = mongoose.model("UserTable",UserSchema);
export default User;