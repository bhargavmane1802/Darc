import mongoose from "mongoose"
const User_Schema=new mongoose.Schema({
    name:{
        type:String,
    },
    username:{
        type:String,
        required:true,
        unique:true,
    },
    password:{
        type:String,
        required:true,
    },
    email:{
        type:String,
        required:true,
        unique:true,
    },
    about:{
        type:String,
    },
    avatar:{
        type:String,
        default: null
    },
    status:{
        type:String,
        default:null,
    }
})
const user_Model=mongoose.model("User",User_Schema);
export {user_Model};