import mongoose from "mongoose"
const journal_Schema=new mongoose.Schema({
    author:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
    room:{type:mongoose.Schema.Types.ObjectId,ref:"Room"},
    content:{type:String},
    reaction:[{type:String}],//emojie
    aiResponse:{type:String}
},{ timestamps: true })
const journal_Model= mongoose.model("Journal",journal_Schema);
export default journal_Model;