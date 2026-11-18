import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
import { getIO } from "../sockets/socketInstance.js";
import { generateEmbeddings as generateEmbeddingsFactory, getAIFeedback as getAIFeedbackFactory } from "../services/ai.service.js";
const _getAIFeedback = getAIFeedbackFactory();
const _generateEmbeddings = generateEmbeddingsFactory();
import message_Model from "../model/message.model.js";
import redis from "../config/redis.js";
import { pineconeIndex } from "../config/pinecone.js";
import { journalQueue } from "../queue/journal.queue.js";
import { digest_Model } from "../model/digest.model.js";
import { deleteImage } from "../config/cloudinary.js";
const createEntries = (JournalModel = journal_Model,queue = journalQueue,getSocketIO = getIO)=>{
    return async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { id } = req.user;
        const {content} = req.body;
        const imageUrl = req.file ? req.file.path : null;
        const publicId=req.file ? req.file.filename : null;
        if (!id || (!content && !imageUrl)) return res.status(404).json({ message: "Insufficient" });
        const journal = new JournalModel({
            author: id,
            room: roomId,
            content: content,
            imageUrl: imageUrl,
            publicId:publicId
        })
        const result =await journal.save();
        if(content){await queue.add('createEmbedding',{journalId:result.id,content},{attempts: 3,backoff: { type: 'exponential', delay: 2000}});}
        await result.populate("author", "username imageUrl");
        const io=getSocketIO();
        io.to(roomId).emit("create_journal",result);
        return res.status(201).json("journal entry created");

    }
    catch (err) {
        console.log("Failed to create journal entry");
        err.message="Failed createEntries";
        next(err);
    }
}
}
const displayEntries = (JournalModel = journal_Model) =>
  async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const journal = await JournalModel.find({ room: roomId })
        .select("_id author room content imageUrl reaction createdAt updatedAt aiResponse")
        .populate("author", "username imageUrl ")
        .lean();
        const report=await digest_Model.find({ room: roomId })
        .select("_id author room content createdAt")
        .populate("author", "username imageUrl ")
        .lean();
        const merged = [...journal, ...report].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );

        return res.send(merged);
    }
    catch (err) {
        console.log("Failed to display journal entry");
        err.message="Failed displayEntries";
        next(err);
    }
}
// const updateEntries = (JournalModel = journal_Model, getSocketIO = getIO) =>
//   async (req, res, next) => {
//     try {
//         const { id } = req.user;
//         const { roomId, journalId } = req.params;
//         const { content} = req.body;
//         const imageUrl = req.file ? req.file.path : null;
//         const publicId=req.file ? req.file.filename : null;
//         if(!content && !imageUrl)return res.status(404).json({message:"Insufficient"});
//         const journal = await JournalModel.findOneAndUpdate(
//             { _id: journalId, author: id },
//             { $set: { content ,imageUrl,publicId} },
//             { returnDocument: "before", runValidators: true }
//             );

//             if (!journal) {
//             return res.status(403).json({ message: "Unauthorized" });
//             }
//         journal.content=content;
//         journal.imageUrl=imageUrl;
//         journal.publicId=publicId;
//         const io=getSocketIO();
//         io.to(roomId).emit("update_journal",{journal});
//         res.status(200).json({ message: "journal updated" });
//     }
//     catch (err) {
//         console.log("Failed to update journal entry");
//         err.message="Failed updateEntries";
//         next(err);
//     }
// }
const deleteEntries = (JournalModel = journal_Model, pcIndex = pineconeIndex, redisClient = redis, getSocketIO = getIO) =>
  async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, journalId } = req.params;
        const response = await JournalModel.findOneAndDelete({
                _id: journalId,
                author: id,
                room: roomId
            });
        if (!response) return res.status(403).json({ message: "Unauthorized or entry not found" });
        if(response.publicId){ try {
                await deleteImage(response.publicId);
            } catch (err) {
                console.error("Cloudinary deletion failed:", err);
            }}
        // 3. LAYER 2: Evict semantic vectors and metadata payload from Pinecone
        try {
            await pcIndex.deleteOne({
                id: journalId.toString()
            });
        } catch (err) {
            console.error("Pinecone deletion failed:", err);
        }
        // 4. LAYER 3: Evict the AI response cache key from Redis
        try {
            const cacheKey =
                `ai_response:room:${roomId}:journal:${journalId}`;

            await redisClient.del(cacheKey);
        } catch (err) {
            console.error("Redis deletion failed:", err);
        }


        // 5. Broadcast real-time deletion update to the socket channel
        const io = getSocketIO();
        io.to(roomId).emit("delete_journal", { entry_id: journalId });

        // 6. Return response to sender client
        return res.status(200).json({ message: "journal deleted" });
    }
    catch (err) {
        console.error("❌ Failed cascading deleteEntries execution:", err);
        err.message = "Failed deleteEntries";
        next(err);
    }
};
// return the date
const getStartOfToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

const aiResponses= (JournalModel = journal_Model, redisClient = redis, pcIndex = pineconeIndex, aiService = { getAIFeedback: _getAIFeedback })=>async(req,res,next)=>{
    try{
        const {id}=req.user;
        const {roomId,journalId}=req.params;
        const cacheKey = `ai_response:room:${roomId}:journal:${journalId}`;
        const cachedResponse = await redisClient.get(cacheKey);
        if(cachedResponse){
            res.setHeader("Content-Type", "text/event-stream");
            res.write(`data: ${JSON.stringify({ token: cachedResponse })}\n\n`);
            res.write(`data: ${JSON.stringify({ token: "[DONE]" })}\n\n`);
            return res.end();
        }

        //mongo db local check
        const entry=await JournalModel.findOne({_id:journalId,room :roomId});
        if (!entry) {
            res.setHeader("Content-Type", "text/event-stream");
            res.write(`data: ${JSON.stringify({ error: "entry not found " })}\n\n`);
            return res.end();
        }
        if (entry.aiResponse) {

            // Re-hydrate the Redis cache aside layer (24 hours TTL)
            await redisClient.set(cacheKey, entry.aiResponse, "EX", 86400);

            res.setHeader("Content-Type", "text/event-stream");
            res.write(`data: ${JSON.stringify({ token: entry.aiResponse })}\n\n`);
            res.write(`data: ${JSON.stringify({ token: "[DONE]" })}\n\n`);
            return res.end();
        }

        const currentVector =entry.embedding;
        const pineconeRes = await pcIndex.query({
            vector: currentVector,
            topK: 5,
            includeMetadata: true,
            filter: {
                roomId: { $eq: roomId.toString() },
                authorId: { $eq: entry.author.toString() }
            }
        });

        const pastEntries = pineconeRes.matches
            .filter(match => match.id !== journalId.toString())
            .slice(0, 2)
            .map(match => ({
                content: match.metadata.content,
                aiResponse: match.metadata.aiResponse || "No historical analysis recorded for this entry."
            }));
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const stream=await aiService.getAIFeedback(entry.content,pastEntries);

        let fullResponse = "";

        for await (const chunk of stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        res.write(`data: ${JSON.stringify({ token: chunkText })}\n\n`);
        }

        entry.aiResponse = fullResponse;
        await entry.save();
        await redisClient.set(cacheKey, fullResponse, "EX", 86400);
        pcIndex.update({
            id: journalId.toString(),
            metadata: {
                roomId: roomId.toString(),
                authorId: entry.author.toString(),
                content: entry.content,
                aiResponse: fullResponse
            }
        }).catch(err => console.error("⚠️ Background Pinecone Metadata Update Failed:", err));
        res.write(`data: ${JSON.stringify({ token: "[DONE]" })}\n\n`);
        res.end();

    }
    catch(err){
        console.error("Streaming Error:", err);
        res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
        res.end();
    }
}
const manageReaction= (JournalModel = journal_Model, getSocketIO = getIO) => async(req,res,next)=>{
    const{journalId}=req.params;
    const {emoji}=req.body;
    const userId=req.user.id;
    try{
        const entry = await JournalModel.findById(journalId);
        if(!entry)return res.status(404).json({ message: "Insufficient" });
        const reactionGroup=entry.reaction.find(r=> r.emoji===emoji);
        if(reactionGroup){
            const userIndex = reactionGroup.users.indexOf(userId);
            if(userIndex>-1){
                await JournalModel.updateOne(
                { _id: journalId, "reaction.emoji": emoji },
                { $pull: { "reaction.$.users": userId } }
                );
            }
            else {
                // User hasn't reacted -> ADD
                await JournalModel.updateOne(
                   { _id: journalId, "reaction.emoji": emoji },
                    { $addToSet: { "reaction.$.users": userId } }
                );
            }
        }
        else {
            // Emoji group doesn't exist -> CREATE NEW GROUP
            await JournalModel.findByIdAndUpdate(journalId, {
                $push: { reaction: { emoji, users: [userId] } }
            });
        }
        const updatedEntry = await JournalModel.findById(journalId).select("reaction");

        // BROADCAST via Socket
        getSocketIO().to(entry.room.toString()).emit("reaction_journal", {
        entryId: journalId,
        reactions: updatedEntry.reaction
        });

        res.status(200).json(updatedEntry.reaction);
    }
    catch(err){
        console.log("Failed to reaction of journal entry");
        err.message="Failed manageReaction";
        next(err);
    }
}
export { createEntries, displayEntries, deleteEntries, aiResponses, manageReaction };

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO Equivalent Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Socket.IO equivalent of createEntries
 * Event: "create_journal"
 * Broadcasts: "create_journal" to room
 * Emits to sender: "create_journal_success" (or executes callback)
 */
const createEntriesSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return createEntriesSocket()(args[0], args[1], args[2], args[3]);
    }
    let JournalModel = journal_Model;
    let queue = journalQueue;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].JournalModel) JournalModel = args[0].JournalModel;
        if (args[0].queue) queue = args[0].queue;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) JournalModel = args[0];
        if (args[1]) queue = args[1];
        if (args[2]) getSocketIO = args[2];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const roomId = data.roomId || data.room_id;
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId;
            const content = data.content;
            const imageUrl = data.imageUrl || data.image_url || null;
            const publicId = data.publicId || data.public_id || null;

            if (!id || (!content && !imageUrl)) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "Insufficient" });
                }
                socket?.emit("error", { message: "Insufficient" });
                return;
            }

            const journal = new JournalModel({
                author: id,
                room: roomId,
                content: content,
                imageUrl: imageUrl,
                publicId: publicId
            });

            const result = await journal.save();
            if (content) {
                await queue.add(
                    'createEmbedding',
                    { journalId: result.id, content },
                    { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
                );
            }
            await result.populate("author", "username imageUrl");

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            if (roomId) {
                ioInstance.to(roomId).emit("create_journal", result);
            }

            if (typeof callback === "function") {
                callback({ status: 201, message: "journal entry created", data: result });
            }
            socket?.emit("create_journal_success", { message: "journal entry created", data: result });
            return result;
        } catch (err) {
            console.log("Failed to create journal entry (socket):", err);
            err.message = "Failed createEntries";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed createEntries", error: err.message });
            }
            socket?.emit("error", { message: "Failed createEntries", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of displayEntries
 * Event: "display_journal"
 * Emits to sender: "display_journal" (or executes callback)
 */
const displayEntriesSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return displayEntriesSocket()(args[0], args[1], args[2], args[3]);
    }
    let JournalModel = journal_Model;
    let DigestModel = digest_Model;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].JournalModel) JournalModel = args[0].JournalModel;
        if (args[0].DigestModel) DigestModel = args[0].DigestModel;
    } else {
        if (args[0]) JournalModel = args[0];
        if (args[1]) DigestModel = args[1];
    }

    return async (data, socket, io, callback) => {
        try {
            const roomId = typeof data === "string" ? data : (data?.roomId || data?.room_id);
            if (!roomId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "roomId is required" });
                }
                socket?.emit("error", { message: "roomId is required" });
                return;
            }

            const journal = await JournalModel.find({ room: roomId })
                .select("_id author room content imageUrl reaction createdAt updatedAt aiResponse")
                .populate("author", "username imageUrl ")
                .lean();

            const report = await DigestModel.find({ room: roomId })
                .select("_id author room content createdAt")
                .populate("author", "username imageUrl ")
                .lean();

            const merged = [...journal, ...report].sort(
                (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
            );

            socket?.emit("display_journal", merged);
            if (typeof callback === "function") {
                callback({ status: 200, data: merged });
            }
            return merged;
        } catch (err) {
            console.log("Failed to display journal entry (socket):", err);
            err.message = "Failed displayEntries";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed displayEntries", error: err.message });
            }
            socket?.emit("error", { message: "Failed displayEntries", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of updateEntries
 * Event: "update_journal"
 * Broadcasts: "update_journal" to room
 * Emits to sender: "update_journal_success" (or executes callback)
 */
const updateEntriesSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return updateEntriesSocket()(args[0], args[1], args[2], args[3]);
    }
    let JournalModel = journal_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].JournalModel) JournalModel = args[0].JournalModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) JournalModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId;
            const roomId = data.roomId || data.room_id;
            const journalId = data.journalId || data.journal_id || data.entryId || data.entry_id;
            const content = data.content;
            const imageUrl = data.imageUrl || data.image_url || null;
            const publicId = data.publicId || data.public_id || null;

            if (!content && !imageUrl) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "Insufficient" });
                }
                socket?.emit("error", { message: "Insufficient" });
                return;
            }

            const journal = await JournalModel.findOneAndUpdate(
                { _id: journalId, author: id },
                { $set: { content, imageUrl, publicId } },
                { returnDocument: "before", runValidators: true }
            );

            if (!journal) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "Unauthorized" });
                }
                socket?.emit("error", { message: "Unauthorized" });
                return;
            }

            journal.content = content;
            journal.imageUrl = imageUrl;
            journal.publicId = publicId;

            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            if (roomId) {
                ioInstance.to(roomId).emit("update_journal", { journal });
            }

            if (typeof callback === "function") {
                callback({ status: 200, message: "journal updated", journal });
            }
            socket?.emit("update_journal_success", { message: "journal updated", journal });
            return journal;
        } catch (err) {
            console.log("Failed to update journal entry (socket):", err);
            err.message = "Failed updateEntries";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed updateEntries", error: err.message });
            }
            socket?.emit("error", { message: "Failed updateEntries", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of deleteEntries
 * Event: "delete_journal"
 * Broadcasts: "delete_journal" to room
 * Emits to sender: "delete_journal_success" (or executes callback)
 */
const deleteEntriesSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return deleteEntriesSocket()(args[0], args[1], args[2], args[3]);
    }
    let JournalModel = journal_Model;
    let pcIndex = pineconeIndex;
    let redisClient = redis;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].JournalModel) JournalModel = args[0].JournalModel;
        if (args[0].pcIndex) pcIndex = args[0].pcIndex;
        if (args[0].redisClient) redisClient = args[0].redisClient;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) JournalModel = args[0];
        if (args[1]) pcIndex = args[1];
        if (args[2]) redisClient = args[2];
        if (args[3]) getSocketIO = args[3];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const id = socket?.user?.id || socket?.user?._id || data.id || data.userId;
            const roomId = data.roomId || data.room_id;
            const journalId = data.journalId || data.journal_id || data.entryId || data.entry_id;

            if (!id || !roomId || !journalId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing required parameters" });
                }
                socket?.emit("error", { message: "Missing required parameters" });
                return;
            }

            const response = await JournalModel.findOneAndDelete({
                _id: journalId,
                author: id,
                room: roomId
            });

            if (!response) {
                if (typeof callback === "function") {
                    return callback({ status: 403, message: "Unauthorized or entry not found" });
                }
                socket?.emit("error", { message: "Unauthorized or entry not found" });
                return;
            }

            if (response.publicId) {
                try {
                    await deleteImage(response.publicId);
                } catch (err) {
                    console.error("Cloudinary deletion failed:", err);
                }
            }

            // Evict semantic vectors and metadata payload from Pinecone
            try {
                await pcIndex.deleteOne({
                    id: journalId.toString()
                });
            } catch (err) {
                console.error("Pinecone deletion failed:", err);
            }

            // Evict the AI response cache key from Redis
            try {
                const cacheKey = `ai_response:room:${roomId}:journal:${journalId}`;
                await redisClient.del(cacheKey);
            } catch (err) {
                console.error("Redis deletion failed:", err);
            }

            // Broadcast real-time deletion update to the socket channel
            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            ioInstance.to(roomId).emit("delete_journal", { entry_id: journalId });

            if (typeof callback === "function") {
                callback({ status: 200, message: "journal deleted", entry_id: journalId });
            }
            socket?.emit("delete_journal_success", { message: "journal deleted", entry_id: journalId });
            return { message: "journal deleted", entry_id: journalId };
        } catch (err) {
            console.error("❌ Failed cascading deleteEntries execution (socket):", err);
            err.message = "Failed deleteEntries";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed deleteEntries", error: err.message });
            }
            socket?.emit("error", { message: "Failed deleteEntries", error: err.message });
        }
    };
};

/**
 * Socket.IO equivalent of aiResponses
 * Event: "ai_response"
 * Streams tokens to requester: "ai_response" with { journalId, roomId, token }
 * Signals completion: "ai_response" with { journalId, roomId, token: "[DONE]" } and "ai_response_done"
 */
const aiResponsesSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return aiResponsesSocket()(args[0], args[1], args[2], args[3]);
    }
    let JournalModel = journal_Model;
    let redisClient = redis;
    let pcIndex = pineconeIndex;
    let aiService = { getAIFeedback: _getAIFeedback };

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].JournalModel) JournalModel = args[0].JournalModel;
        if (args[0].redisClient) redisClient = args[0].redisClient;
        if (args[0].pcIndex) pcIndex = args[0].pcIndex;
        if (args[0].aiService) aiService = args[0].aiService;
    } else {
        if (args[0]) JournalModel = args[0];
        if (args[1]) redisClient = args[1];
        if (args[2]) pcIndex = args[2];
        if (args[3]) aiService = args[3];
    }

    return async (data = {}, socket, io, callback) => {
        const roomId = data.roomId || data.room_id;
        const journalId = data.journalId || data.journal_id || data.entryId || data.entry_id;

        try {
            if (!roomId || !journalId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Missing roomId or journalId" });
                }
                socket?.emit("error", { message: "Missing roomId or journalId" });
                return;
            }

            const cacheKey = `ai_response:room:${roomId}:journal:${journalId}`;
            const cachedResponse = await redisClient.get(cacheKey);

            if (cachedResponse) {
                socket?.emit("ai_response", { journalId, roomId, token: cachedResponse });
                socket?.emit("ai_response", { journalId, roomId, token: "[DONE]" });
                socket?.emit("ai_response_done", { journalId, roomId, fullResponse: cachedResponse });
                if (typeof callback === "function") {
                    callback({ status: 200, data: cachedResponse });
                }
                return;
            }

            // mongo db local check
            const entry = await JournalModel.findOne({ _id: journalId, room: roomId });
            if (!entry) {
                socket?.emit("ai_response", { journalId, roomId, error: "entry not found " });
                socket?.emit("error", { message: "entry not found " });
                if (typeof callback === "function") {
                    callback({ status: 404, error: "entry not found " });
                }
                return;
            }

            if (entry.aiResponse) {
                // Re-hydrate the Redis cache aside layer (24 hours TTL)
                await redisClient.set(cacheKey, entry.aiResponse, "EX", 86400);

                socket?.emit("ai_response", { journalId, roomId, token: entry.aiResponse });
                socket?.emit("ai_response", { journalId, roomId, token: "[DONE]" });
                socket?.emit("ai_response_done", { journalId, roomId, fullResponse: entry.aiResponse });
                if (typeof callback === "function") {
                    callback({ status: 200, data: entry.aiResponse });
                }
                return;
            }

            const currentVector = entry.embedding;
            const pineconeRes = await pcIndex.query({
                vector: currentVector,
                topK: 5,
                includeMetadata: true,
                filter: {
                    roomId: { $eq: roomId.toString() },
                    authorId: { $eq: entry.author.toString() }
                }
            });

            const pastEntries = pineconeRes.matches
                .filter(match => match.id !== journalId.toString())
                .slice(0, 2)
                .map(match => ({
                    content: match.metadata.content,
                    aiResponse: match.metadata.aiResponse || "No historical analysis recorded for this entry."
                }));

            const stream = await aiService.getAIFeedback(entry.content, pastEntries);

            let fullResponse = "";

            for await (const chunk of stream) {
                const chunkText = chunk.text();
                fullResponse += chunkText;
                socket?.emit("ai_response", { journalId, roomId, token: chunkText });
            }

            entry.aiResponse = fullResponse;
            await entry.save();
            await redisClient.set(cacheKey, fullResponse, "EX", 86400);

            pcIndex.update({
                id: journalId.toString(),
                metadata: {
                    roomId: roomId.toString(),
                    authorId: entry.author.toString(),
                    content: entry.content,
                    aiResponse: fullResponse
                }
            }).catch(err => console.error("⚠️ Background Pinecone Metadata Update Failed:", err));

            socket?.emit("ai_response", { journalId, roomId, token: "[DONE]" });
            socket?.emit("ai_response_done", { journalId, roomId, fullResponse });
            if (typeof callback === "function") {
                callback({ status: 200, data: fullResponse });
            }
        } catch (err) {
            console.error("Streaming Error (socket):", err);
            socket?.emit("ai_response", { journalId, roomId, error: "Stream failed" });
            socket?.emit("error", { message: "Stream failed", error: err.message });
            if (typeof callback === "function") {
                callback({ status: 500, error: "Stream failed" });
            }
        }
    };
};

/**
 * Socket.IO equivalent of manageReaction
 * Event: "reaction_journal"
 * Broadcasts: "reaction_journal" to room
 * Emits to sender: "reaction_journal_success" (or executes callback)
 */
const manageReactionSocket = (...args) => {
    if (args.length >= 2 && args[1] && typeof args[1].emit === "function") {
        return manageReactionSocket()(args[0], args[1], args[2], args[3]);
    }
    let JournalModel = journal_Model;
    let getSocketIO = getIO;

    if (args.length === 1 && args[0] && typeof args[0] === "object" && !args[0].schema) {
        if (args[0].JournalModel) JournalModel = args[0].JournalModel;
        if (args[0].getSocketIO) getSocketIO = args[0].getSocketIO;
    } else {
        if (args[0]) JournalModel = args[0];
        if (args[1]) getSocketIO = args[1];
    }

    return async (data = {}, socket, io, callback) => {
        try {
            const journalId = data.journalId || data.journal_id || data.entryId || data.entry_id;
            const emoji = data.emoji;
            const userId = socket?.user?.id || socket?.user?._id || data.userId || data.user_id;

            if (!journalId || !emoji || !userId) {
                if (typeof callback === "function") {
                    return callback({ status: 400, message: "Insufficient" });
                }
                socket?.emit("error", { message: "Insufficient" });
                return;
            }

            const entry = await JournalModel.findById(journalId);
            if (!entry) {
                if (typeof callback === "function") {
                    return callback({ status: 404, message: "Insufficient" });
                }
                socket?.emit("error", { message: "Insufficient" });
                return;
            }

            const reactionGroup = entry.reaction.find(r => r.emoji === emoji);
            if (reactionGroup) {
                const userIndex = reactionGroup.users.indexOf(userId);
                if (userIndex > -1) {
                    await JournalModel.updateOne(
                        { _id: journalId, "reaction.emoji": emoji },
                        { $pull: { "reaction.$.users": userId } }
                    );
                } else {
                    // User hasn't reacted -> ADD
                    await JournalModel.updateOne(
                        { _id: journalId, "reaction.emoji": emoji },
                        { $addToSet: { "reaction.$.users": userId } }
                    );
                }
            } else {
                // Emoji group doesn't exist -> CREATE NEW GROUP
                await JournalModel.findByIdAndUpdate(journalId, {
                    $push: { reaction: { emoji, users: [userId] } }
                });
            }

            const updatedEntry = await JournalModel.findById(journalId).select("reaction");

            // BROADCAST via Socket
            const ioInstance = io || (getSocketIO ? getSocketIO() : getIO());
            ioInstance.to(entry.room.toString()).emit("reaction_journal", {
                entryId: journalId,
                reactions: updatedEntry.reaction
            });

            if (typeof callback === "function") {
                callback({ status: 200, data: updatedEntry.reaction });
            }
            socket?.emit("reaction_journal_success", {
                entryId: journalId,
                reactions: updatedEntry.reaction
            });
            return updatedEntry.reaction;
        } catch (err) {
            console.log("Failed to reaction of journal entry (socket):", err);
            err.message = "Failed manageReaction";
            if (typeof callback === "function") {
                callback({ status: 500, message: "Failed manageReaction", error: err.message });
            }
            socket?.emit("error", { message: "Failed manageReaction", error: err.message });
        }
    };
};

// Aliases matching socket.js handle* convention
const handleCreateEntries = createEntriesSocket;
const handleDisplayEntries = displayEntriesSocket;
const handleUpdateEntries = updateEntriesSocket;
const handleDeleteEntries = deleteEntriesSocket;
const handleAiResponses = aiResponsesSocket;
const handleManageReaction = manageReactionSocket;

// Aliases matching handleJournal* convention
const handleJournalCreate = createEntriesSocket;
const handleJournalDisplay = displayEntriesSocket;
const handleJournalUpdate = updateEntriesSocket;
const handleJournalDelete = deleteEntriesSocket;
const handleJournalAiResponse = aiResponsesSocket;
const handleJournalReaction = manageReactionSocket;

export {
    createEntriesSocket,
    displayEntriesSocket,
    updateEntriesSocket,
    deleteEntriesSocket,
    aiResponsesSocket,
    manageReactionSocket,
    handleCreateEntries,
    handleDisplayEntries,
    handleUpdateEntries,
    handleDeleteEntries,
    handleAiResponses,
    handleManageReaction,
    handleJournalCreate,
    handleJournalDisplay,
    handleJournalUpdate,
    handleJournalDelete,
    handleJournalAiResponse,
    handleJournalReaction
};
