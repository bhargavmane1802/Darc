import message_Model from "../model/message.model.js";
import {getIO} from "../sockets/socket.js"

const messageCreate = (MessageModel = message_Model, getSocketIO = getIO) =>
  async (req, res, next) => {
    try {
      const { id } = req.user;
      const { roomId } = req.params;
      const { content } = req.body;

      // Safe access: extract Cloudinary URL or fallback to null
      const imageUrl = req.file ? req.file.path : null;
      const textContent = content?.trim() || "";

      // Ensure at least one piece of data exists
      if (!textContent && !imageUrl) {
        return res.status(400).json({ message: "Content or image is required" });
      }

      // Determine message type
      const type = imageUrl ? (textContent ? "mixed" : "image") : "text";

      const message = new MessageModel({
        sender: id,
        room: roomId,
        content: textContent,
        imageUrl: imageUrl,
        type: type,
      });

      await message.save();
      await message.populate("sender", "username");

      const io = getSocketIO();
      io.to(roomId).emit("message_new", message);

      return res.status(201).json({ 
        message: "Message created successfully", 
        data: message 
      });
    } catch (err) {
      console.error("failed to create new message:", err);
      err.message = "failed messageCreate";
      next(err);
    }
  };

const messageUpdate = (MessageModel = message_Model, getSocketIO = getIO) =>
    async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, messageId } = req.params;
        const message = await MessageModel.findOne({ _id: messageId, sender: id });
        if (!message) return res.status(403).json({ message: "Unauthorized" });
        const { content, type } = req.body;
        if(!content && !type)return res.status(404).json({message:"Insufficent data"});
        if (content) message.content = content;
        if (type) message.type = type;
        await message.save();
        const io=getSocketIO();
        io.to(roomId).emit("update_message",message);
        res.status(200).json({ message: "message updated" });
    }
    catch (err) {
        console.log("failed to update message");
        err.message="failed messageUpdate"
        next(err);
    }
}

const messageDelete = (MessageModel = message_Model, getSocketIO = getIO) =>
    async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, messageId } = req.params;
        const message = await MessageModel.findOne({ _id: messageId, sender: id });
        if (!message) return res.status(403).json({ message: "Unauthorized" });
        const response = await MessageModel.deleteOne({ _id: messageId });
        const io=getSocketIO();
        io.to(roomId).emit("delete_message",message._id);
        res.status(200).json({ message: "message deleted" });
    }
    catch (err) {
        console.log("failed to delete message");
        err.message="failed messageDelete"
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

const messageDisplay = (MessageModel = message_Model) =>
    async (req,res,next)=>{
    try{
        const {roomId}=req.params;
        const message=await MessageModel.find({room:roomId}).populate("sender","username");
        return res.status(200).json({message});
    }
    catch(err){
        console.log("failed to display message");
        err.message="failed messageDisplay";
        next(err);
    }

}

export { messageCreate, messageUpdate, messageDelete ,messageDisplay};