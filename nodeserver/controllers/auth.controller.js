import User from '../models/user.model.js';
import bcryptjs from 'bcryptjs'
import {errorHandler} from '../uits/error.js';

export const signup = async(req,res,next) =>{
    console.log(req.body);
    const{ username, email, password}= req.body;
    const hashedPassword=bcryptjs.hashSync(password,10);
    const phone = "";
    const address = "";
    const newUser = new User ({username,email,password:hashedPassword,phone,address});
    console.log(newUser);

    try {
        await newUser.save();
        res.status(201).json("User created successfully")
    
    } catch (error) {
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

