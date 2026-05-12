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
        type:String,
        default:false,
    }
})
const user_Model=mongoose.model("User",User_Schema);
export {user_Model};