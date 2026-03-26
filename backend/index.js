import mongoose from "mongoose"
import express, { urlencoded } from "express"
import dotenv from "dotenv"
import {Router} from "express"
import userRouter from "./src/routers/userRouter.js"
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
app.use(express.urlencoded({ extended: true }));
app.use("/user",userRouter);
app.get("/",(req,res)=>{
    res.send("it is working");
})