import mongoose from "mongoose"
import express, { urlencoded } from "express"
import dotenv from "dotenv"
import {Router} from "express"
import userRouter from "./src/routers/userRouter.js"
import validate_auth from "./src/controllers/auth.controller.js"
import {user_Model} from "./src/model/user.model.js"
import routes from "./src/routers/routes.js"
dotenv.config();
const app=express();
const port =8080;
const main=async()=>{
    try{
        await mongoose.connect(process.env.Mongo_Url);
        console.log("DB conneccted");
    }
    catch(e){
        console.log(e);
    }
}
main();
app.listen(port,()=>{
    console.log("listning at port 8080");
})
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/user",userRouter);
app.use("/auth/",validate_auth);
app.use("/auth/room",routes);
app.get("/auth/",async(req,res)=>{
    try{console.log(req.user);
    const {username,id}=req.user;
    const user=await user_Model.findById({_id:id});
    console.log(user);
    if(!user)res.status(404).json({message:"usernot found"});
    res.status(200).json({message:user});}
    catch(e){
       res.status(404).json({message:"usernot found",e});
    }
})
app.get("/",(req,res)=>{
    res.send("it is working");
})
app.use("/",(err,req,res,next)=>{
    res.send("Error 404");
})