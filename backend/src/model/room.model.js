import mongoose from "mongoose"
const room_Schema=new mongoose.Schema({
    name:{type:String, required:true,unique:true},
    owner:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
    description:{type:String},
    members:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User",
    }],
    isPrivate:{type:Boolean ,default:false},
    inviteCode:{type:String, required:true},
},{ timestamps: true })
const room_Model= mongoose.model("Room",room_Schema);
export default room_Model;