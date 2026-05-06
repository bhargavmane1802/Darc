import message_Model from "../model/message.model.js";
import {getIO} from "../sockets/socket.js"
const messageCreate = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId } = req.params;
        let { content, type } = req.body;
        if (!content) return res.status(400).json({ message: "insufficient content" });
        if (!type) type = "NA"
        const message = new message_Model({
            sender: id,
            room: roomId,
            content: content,
            type: type
        });
        await message.save();
        await message.populate("sender","username");
        const io = getIO();
        io.to(roomId).emit("message_new", message);
        return res.status(200).json({ message: "meggage created" });
    }
    catch (err) {
        next(err);
    }
}
const messageUpdate = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, messageId } = req.params;
        const message = await message_Model.findOne({ _id: messageId, sender: id });
        if (!message) return res.status(403).json({ message: "the does not exists or u are not the sender" });
        const { content, type } = req.body;
        if(!content && !type)return res.status(400).json({message:"empty fields "});
        if (content) message.content = content;
        if (type) message.type = type;
        await message.save();
        const io=getIO();
        io.to(roomId).emit("update_message",message);
        res.status(201).json({ message: "message updated" });
    }
    catch (err) {
        next(err);
    }
}
const messageDelete = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, messageId } = req.params;
        const message = await message_Model.findOne({ _id: messageId, sender: id });
        if (!message) return res.status(403).json({ message: "the message does not exists or u are not the sender" });
        const response = await message_Model.deleteOne({ _id: messageId });
        console.log(response);
        const io=getIO();
        io.to(roomId).emit("delete_message",message._id);
        res.status(201).json({ message: "message deleted" });
    }
    catch (err) {
        next(err);
    }
}
// const messageRead=async(req,res,next)=>{
//     try{
//         const {id}=req.user;
//         const {roomId,messageId}=req.params;
//         const message=await message_Model.findOne({_id:messageId});
//         if(!message)return res.status(403).json({message:"the does not exists "});
//         message.readBy.push(id);
//         console.log(response);
//         res.status(201).json({message:"message updated"});
//     }
//     catch(err){
//         next(err);
//     }
// }
const messageDisplay=async (req,res,next)=>{
    try{
        const {roomId}=req.params;
        const message=await message_Model.find({room:roomId}).populate("sender","username");
        return res.send(message);
    }
    catch(err){
        return next(err);
    }

}
export { messageCreate, messageUpdate, messageDelete ,messageDisplay};