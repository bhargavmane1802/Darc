import mongoose from "mongoose"
const message_Schema=new mongoose.Schema({
    sender:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
    room:{type:mongoose.Schema.Types.ObjectId,ref:"Room",required:true},
    content:{type:String},
    readBy:[{
        type:mongoose.Schema.Types.ObjectId,ref:"User"
    }],
    imageUrl: { 
    type: String, 
    default: null 
    },
    type:{type:String},
},{ timestamps: true })
message_Schema.index({
  room: 1,
  createdAt: -1
});
const message_Model= mongoose.model("Message",message_Schema);
export default message_Model;