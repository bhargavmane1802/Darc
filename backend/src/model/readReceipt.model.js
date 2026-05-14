import mongoose from  "mongoose"
const readReceipt_Schema=new mongoose.Schema(
    {
    room: {type:mongoose.Schema.Types.ObjectId,ref:"Room",required:true},
    user: {type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
    lastReadMessageId: {type:mongoose.Schema.Types.ObjectId,ref:"Message",required:true},
},{timestamps:true}
)
const readReceipt_Model=mongoose.model("ReadReceipt",readReceipt_Schema);
export default readReceipt_Model;