import mongoose from "mongoose"
const journal_Schema=new mongoose.Schema({
    author:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
    room:{type:mongoose.Schema.Types.ObjectId,ref:"Room",required:true},
    content:{type:String},
    reaction:[{
        emoji:{type:String,required:true },
        users:{type:mongoose.Schema.Types.ObjectId,ref:"User"}
    }],//emoji
    aiResponse:{type:String}
},{ timestamps: true })
const journal_Model= mongoose.model("Journal",journal_Schema);
export default journal_Model;