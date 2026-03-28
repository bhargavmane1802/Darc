import mongoose from "mongoose"
const message_Schema=new mongoose.Schema({
    sender:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
    room:{type:mongoose.Schema.Types.ObjectId,ref:"Room"},
    content:{type:String},
    readBy:[{
        type:mongoose.Schema.Types.ObjectId,ref:"User"
    }],
    type:{type:String},
},{ timestamps: true })
const message_Model= mongoose.model("Message",message_Schema);
export default message_Model;