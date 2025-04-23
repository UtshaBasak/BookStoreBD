import User from '../models/user.model.js';
import bcryptjs from 'bcryptjs'
import {errorHandler} from '../uits/error.js';

export const signup = async(req,res,next) =>{
    const { username, email, password } = req.body;
    try {
        // Check for existing username or email
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(409).json({ message: "Username already exists" });
            }
            if (existingUser.email === email) {
                return res.status(409).json({ message: "Email already exists" });
            }
        }
        const hashedPassword = bcryptjs.hashSync(password,10);
        const newUser = new User ({username,email,password:hashedPassword});
        await newUser.save();
        res.status(201).json("User created successfully")
    } catch (error) {
        // Handle duplicate key error (in case of race condition)
        if (error.code === 11000) {
            if (error.keyPattern?.username) {
                return res.status(409).json({ message: "Username already exists" });
            }
            if (error.keyPattern?.email) {
                return res.status(409).json({ message: "Email already exists" });
            }
        }
        next(error);
    }
};

export const signin = async(req,res,next) =>{
    const {email,password} = req.body;
    try{
        const validUser = await User.findOne({email});
        if (!validUser) return next (errorHandler(404,'User not found!'));
        const validPassword = bcryptjs.compareSync(password,validUser.password);
        if (!validPassword) return next (errorHandler(401,'Wrong credentials!'));
        if (validUser && validPassword) {
            res.status(200).json("User founded successfully")
        }
    } catch (error){
        next(error);
    }
}

