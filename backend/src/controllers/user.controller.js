import {user_Model} from "../model/user.model.js"
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
const login=async(req,res)=>{
    try{
        const {username,password}=req.body;
        if(!username || !password)return res.send("incomplete information");
        const user=await user_Model.findOne({username:username});
        if(!user){
            return res.send(" Incorrect credentials 1",user);
        }
        const match= await bcrypt.compare(password,user.password);
        if(!match)return res.send(" Incorrect credentials 2");
        const token=jwt.sign({id:user._id,username:user.username},process.env.Jwt_Key,{expiresIn: '1h'});
        res.status(201).json({ token});
    }
    catch(e){
        console.log(e);
        res.send(e);
    }
}
const register=async(req,res)=>{
    try{const {username,password}=req.body;
    if(!username || !password)return res.send(" insufficient info");
    const user= await user_Model.findOne({username:username});
    console.log(user);
    if(user)return res.send(`username already exists ${user}`);
    const hashed_password=await bcrypt.hash(password,10);
    const newuser= new user_Model({
        username:username.toLowerCase(),
        password:hashed_password,
    })
    await newuser.save();
    console.log("user saved");
    res.status(200).json({message:"user register now redirect to login page"});
    }   
    catch(e){
        console.log("something went wrong regirect to login page ",e);
        return next(err);
    }
    
}
export {register,login}