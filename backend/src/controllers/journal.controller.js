import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
const createEntries=(req,res,next)=>{
    const {roomId}=req.prams;
    const room=room_Model.findOne({_id:roomId});
    if(!room)return res.status(403).json({message:" room id invalid"});
    return next();
}


export {createEntries};