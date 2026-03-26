import mongoose from "mongoose"
const User_Schema=new mongoose.Schema({
    username:{
        type:String,
        required:true,
        unique:true,
    },
    password:{
        type:String,
        required:true,
    },
    token:{
        type:String,
    },
    avatar:{
        type:String
    },
    status:{
        type:Boolean,
        default:false,
    }
})
const User_Model=mongoose.model("User",User_Schema);
export {User_Model}