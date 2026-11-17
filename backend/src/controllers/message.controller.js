import mongoose from "mongoose";
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
      await message.populate("sender", "username imageUrl avatar");

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


const messageDisplay = (MessageModel = message_Model) =>
    async (req,res,next)=>{
    try{
        const {roomId}=req.params;
        const { before, offset, lastMessageId, beforeMessageId, limit: reqLimit } = req.query;
        const limit = Math.min(Math.max(parseInt(reqLimit || 30, 10), 1), 100);
        const cursor = before || offset || lastMessageId || beforeMessageId;

        const query = { room: roomId };
        if (cursor) {
            if (mongoose.Types.ObjectId.isValid(cursor)) {
                const pivot = await MessageModel.findById(cursor).select("createdAt");
                if (pivot) {
                    query.$or = [
                        { createdAt: { $lt: pivot.createdAt } },
                        { createdAt: pivot.createdAt, _id: { $lt: pivot._id } }
                    ];
                } else {
                    query._id = { $lt: cursor };
                }
            } else if (!isNaN(Date.parse(cursor))) {
                query.createdAt = { $lt: new Date(cursor) };
            }
        }

        const fetched = await MessageModel.find(query)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .populate("sender", "username imageUrl avatar")
            .lean();

        const hasMore = fetched.length > limit;
        const rawMessages = hasMore ? fetched.slice(0, limit) : fetched;
        const message = rawMessages.reverse();

        return res.status(200).json({ message, messages: message, hasMore });
    }
    catch(err){
        console.log("failed to display message");
        err.message="failed messageDisplay";
        next(err);
    }

}

export { messageCreate, messageUpdate, messageDelete ,messageDisplay};

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO equivalent of messageCreate
 * Event: "message_send" or "create_message"
 * Broadcasts: "message_new" to room
 * Emits to sender: "message_create_success" (or executes callback)
 */
const messageCreateSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageCreateSocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId || data.sender;
            const roomId = data.roomId || data.room_id || data.room;
            const content = data.content;
            const imageUrl = data.imageUrl || data.image_url || null;
            const textContent = content?.trim() || "";

            // Ensure at least one piece of data exists
            if (!textContent && !imageUrl) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Content or image is required" });
                }
                socket?.emit("error", { message: "Content or image is required" });
                return;
            }

            if (!id || !roomId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Sender id and roomId are required" });
                }
                socket?.emit("error", { message: "Sender id and roomId are required" });
                return;
            }

            // Determine message type
            const type = data.type || (imageUrl ? (textContent ? "mixed" : "image") : "text");

            const message = new MessageModel({
                sender: id,
                room: roomId,
                content: textContent,
                imageUrl: imageUrl,
                type: type,
            });

            await message.save();
            await message.populate("sender", "username imageUrl avatar");

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            ioInstance.to(roomId).emit("message_new", message);

            const responsePayload = {
                message: "Message created successfully",
                data: message,
            };

            if (typeof callback === "function") {
                callback({ status: 201, ...responsePayload });
            }
            socket?.emit("message_create_success", responsePayload);
            return message;
        } catch (err) {
            console.error("failed to create new message (socket):", err);
            err.message = "failed messageCreate";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageCreate", error: err.message });
            }
            socket?.emit("error", { message: "failed messageCreate", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of messageUpdate
 * Event: "update_message"
 * Broadcasts: "update_message" to room
 * Emits to sender: "message_update_success" (or executes callback)
 */
const messageUpdateSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageUpdateSocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId || data.sender;
            const roomId = data.roomId || data.room_id || data.room;
            const messageId = data.messageId || data.message_id || data._id;
            const { content, type } = data;

            if (!id || !roomId || !messageId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing required parameters" });
                }
                socket?.emit("error", { message: "Missing required parameters" });
                return;
            }

            const message = await MessageModel.findOne({ _id: messageId, sender: id });
            if (!message) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "Unauthorized" });
                }
                socket?.emit("error", { message: "Unauthorized" });
                return;
            }

            if (!content && !type) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "Insufficent data" });
                }
                socket?.emit("error", { message: "Insufficent data" });
                return;
            }

            if (content) message.content = content;
            if (type) message.type = type;
            await message.save();
            await message.populate("sender", "username imageUrl avatar");

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            ioInstance.to(roomId).emit("update_message", message);

            if (typeof callback === "function") {
                callback({ status: 200, message: "message updated", data: message });
            }
            socket?.emit("message_update_success", { message: "message updated", data: message });
            return message;
        } catch (err) {
            console.log("failed to update message (socket):", err);
            err.message = "failed messageUpdate";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageUpdate", error: err.message });
            }
            socket?.emit("error", { message: "failed messageUpdate", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of messageDelete
 * Event: "delete_message"
 * Broadcasts: "delete_message" to room
 * Emits to sender: "message_delete_success" (or executes callback)
 */
const messageDeleteSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageDeleteSocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId || data.sender;
            const roomId = data.roomId || data.room_id || data.room;
            const messageId = data.messageId || data.message_id || data._id;

            if (!id || !roomId || !messageId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing required parameters" });
                }
                socket?.emit("error", { message: "Missing required parameters" });
                return;
            }

            const message = await MessageModel.findOne({ _id: messageId, sender: id });
            if (!message) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "Unauthorized" });
                }
                socket?.emit("error", { message: "Unauthorized" });
                return;
            }

            await MessageModel.deleteOne({ _id: messageId });

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            ioInstance.to(roomId).emit("delete_message", message._id);

            if (typeof callback === "function") {
                callback({ status: 200, message: "message deleted", messageId: message._id });
            }
            socket?.emit("message_delete_success", { message: "message deleted", messageId: message._id });
            return { message: "message deleted", messageId: message._id };
        } catch (err) {
            console.log("failed to delete message (socket):", err);
            err.message = "failed messageDelete";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageDelete", error: err.message });
            }
            socket?.emit("error", { message: "failed messageDelete", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of messageDisplay
 * Event: "display_message" or "message_display"
 * Emits to caller: "message_display" (or executes callback)
 */
const messageDisplaySocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageDisplaySocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
    } else {
        if (args[0]) MessageModel = args[0];
    }

    return async (data, socket, io, callback) => {
        try {
                        
            const roomId = typeof data === "string"
                ? data
                : (data?.roomId || data?.room_id || data?.room);

            const cursor = typeof data === "object"
                ? (data?.before || data?.offset || data?.lastMessageId || data?.beforeMessageId)
                : null;

            const limit = typeof data === "object"
                ? Math.min(Math.max(parseInt(data?.limit || 30, 10), 1), 100)
                : 30;

            if (!roomId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "roomId is required" });
                }

                socket?.emit("error", { message: "roomId is required" });
                return;
            }

            const query = { room: new mongoose.Types.ObjectId(roomId) };

            if (cursor) {
                if (mongoose.Types.ObjectId.isValid(cursor)) {
                    query.$expr = {
                        $let: {
                            vars: {
                                pivot: {
                                    $first: {
                                        $filter: {
                                            input: "$_pivot",
                                            as: "p",
                                            cond: { $eq: ["$$p._id", new mongoose.Types.ObjectId(cursor)] }
                                        }
                                    }
                                }
                            },
                            in: {
                                $cond: [
                                    { $ne: ["$$pivot", null] },
                                    {
                                        $or: [
                                            { $lt: ["$createdAt", "$$pivot.createdAt"] },
                                            {
                                                $and: [
                                                    { $eq: ["$createdAt", "$$pivot.createdAt"] },
                                                    { $lt: ["$_id", "$$pivot._id"] }
                                                ]
                                            }
                                        ]
                                    },
                                    { $lt: ["$_id", new mongoose.Types.ObjectId(cursor)] }
                                ]
                            }
                        }
                    };
                } else if (!isNaN(Date.parse(cursor))) {
                    query.createdAt = { $lt: new Date(cursor) };
                }
            }

            const fetched = await MessageModel.aggregate([
                {
                    $match: { room: new mongoose.Types.ObjectId(roomId) }
                },
                {
                    $facet: {
                        pivot: cursor && mongoose.Types.ObjectId.isValid(cursor)
                            ? [
                                {
                                    $match: {
                                        _id: new mongoose.Types.ObjectId(cursor)
                                    }
                                },
                                { $project: { createdAt: 1 } },
                                { $limit: 1 }
                            ]
                            : [{ $limit: 0 }],
                        messages: [
                            {
                                $sort: { createdAt: -1, _id: -1 }
                            },
                            { $limit: 1000 }
                        ]
                    }
                }
            ]);

            const hasMore = fetched.length > limit;
            const rawMessages = hasMore ? fetched.slice(0, limit) : fetched;
            const message = rawMessages.reverse();

            if (typeof callback === "function") {
                callback({ status: 200, message, messages: message, hasMore });
            } else {
                socket?.emit("message_display", { messages: message, message, hasMore, roomId });
            }
            return { message, messages: message, hasMore };
        } catch (err) {
            console.log("failed to display message (socket):", err);
            err.message = "failed messageDisplay";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageDisplay", error: err.message });
            }
            socket?.emit("error", { message: "failed messageDisplay", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of messageRead
 * Event: "read_message"
 * Broadcasts: "readUpdate_message" to room
 * Emits to caller: "message_read_success" (or executes callback)
 */
const messageReadSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return messageReadSocket()(args[0], args[1], args[2], args[3]);
    }
    let MessageModel = message_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].MessageModel) MessageModel = args[0].MessageModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) MessageModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId;
            let roomId, messageId;

            if (typeof data === "string" && typeof socket === "string") {
                roomId = data;
                messageId = socket;
                socket = io;
                io = arguments[3];
                callback = arguments[4];
            } else {
                roomId = data.roomId || data.room_id || data.room;
                messageId = data.messageId || data.message_id || data._id;
            }

            if (!id || !roomId || !messageId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing required parameters" });
                }
                socket?.emit("error", { message: "Missing required parameters" });
                return;
            }

            const message = await MessageModel.findOne({ _id: messageId });
            if (!message) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "the message does not exist" });
                }
                socket?.emit("error", { message: "the message does not exist" });
                return;
            }

            if (Array.isArray(message.readBy) && !message.readBy.includes(id)) {
                message.readBy.push(id);
                await message.save();
            }

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            socket?.to(roomId).emit("readUpdate_message", {
                room_id: roomId,
                user_id: id,
                lastReadMessageId: messageId,
            });

            if (typeof callback === "function") {
                callback({ status: 200, message: "message marked as read" });
            }
            socket?.emit("message_read_success", { message: "message marked as read", messageId });
            return message;
        } catch (err) {
            console.log("failed to mark message read (socket):", err);
            err.message = "failed messageRead";
            if (typeof callback === "function") {
                callback({ status: 500, message: "failed messageRead", error: err.message });
            }
            socket?.emit("error", { message: "failed messageRead", error: err.message });
        }
    };
};

// Aliases matching handle* convention
const handleMessageCreate = messageCreateSocket;
const handleMessageUpdate = messageUpdateSocket;
const handleMessageDelete = messageDeleteSocket;
const handleMessageDisplay = messageDisplaySocket;
const handleMessageRead = messageReadSocket;
const handleMessageSend = messageCreateSocket;

export {
    messageCreateSocket,
    messageUpdateSocket,
    messageDeleteSocket,
    messageDisplaySocket,
    messageReadSocket,
    handleMessageCreate,
    handleMessageUpdate,
    handleMessageDelete,
    handleMessageDisplay,
    handleMessageRead,
    handleMessageSend,
};