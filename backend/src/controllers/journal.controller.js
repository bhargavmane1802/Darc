import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
import {getIO} from "../sockets/socket.js"
import { generateEmbeddings, getAIFeedback } from "../services/ai.service.js";
import message_Model from "../model/message.model.js";
import redis from "../config/redis.js";
import { pineconeIndex } from "../config/pinecone.js";
import { journalQueue } from "../queue/journal.queue.js";
const createEntries = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { id } = req.user;
        const {content, imageUrl} = req.body;
        if (!id || (!content && !imageUrl)) return res.status(404).json({ message: "Insufficient" });
        const journal = new journal_Model({
            author: id,
            room: roomId,
            content: content,
            imageUrl: imageUrl || null,
        })
        const result =await journal.save();
        if(content){await journalQueue.add('createEmbedding',{journalId:result.id,content},{attempts: 3,backoff: { type: 'exponential', delay: 2000}});}
        console.log("added to queue")
        await result.populate("author", "username");
        const io=getIO();
        io.to(roomId).emit("create_journal",result);
        return res.status(201).json("journal entry created");
        
    }
    catch (err) {
        console.log("Failed to create journal entry");
        err.message="Failed createEntries";
        next(err);
    }
}
const displayEntries = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const journal = await journal_Model.find({ room: roomId })
        .select("_id author room content imageUrl reaction createdAt updatedAt aiResponse")
        .populate("author","username")
        .lean();
        return res.send(journal);
        //pagation
        // 10 in one page
        // totalpages=(total journal entries/10 )+1;
        // index based on page=(page no *10)+i (i lies form 1 to 10);
        // do pagation in forntend 
    }
    catch (err) {
        console.log("Failed to display journal entry");
        err.message="Failed displayEntries";
        next(err);
    }
}
const updateEntries = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, journalId } = req.params;
        const { content} = req.body;
        if(!content)return res.status(404).json({message:"Insufficient"});
        const journal = await journal_Model.findOne({ _id: journalId, author: id });
        if (!journal) return res.status(403).json({ message: "Unauthorized" });
        if (content) journal.content = content;
        await journal.save();
        const io=getIO();
        io.to(roomId).emit("update_journal",{journal});
        res.status(200).json({ message: "journal updated" });
    }
    catch (err) {
        console.log("Failed to update journal entry");
        err.message="Failed updateEntries";
        next(err);
    }
}
const deleteEntries = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, journalId } = req.params;

        // 1. Author verification & check if document exists
        const journal = await journal_Model.findOne({ _id: journalId, author: id });
        if (!journal) return res.status(403).json({ message: "Unauthorized or entry not found" });

        // 2. LAYER 1: Permanent removal from MongoDB (Source of Truth)
        const response = await journal_Model.deleteOne({ _id: journalId });
        console.log("MongoDB Delete Result:", response);

        // 3. LAYER 2: Evict semantic vectors and metadata payload from Pinecone
        // This ensures the deleted text is never pulled as context in future RAG queries
        await pineconeIndex.deleteOne({id:journalId.toString()});

        // 4. LAYER 3: Evict the AI response cache key from Redis
        const cacheKey = `ai_response:room:${roomId}:journal:${journalId}`;
        await redis.del(cacheKey);

        console.log(`🗑️ Cascading destruction complete for Journal ${journalId} in Room ${roomId}`);

        // 5. Broadcast real-time deletion update to the socket channel
        const io = getIO();
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

const aiResponses=async(req,res,next)=>{
    try{
        const {id}=req.user;
        const {roomId,journalId}=req.params;
        const cacheKey = `ai_response:room:${roomId}:journal:${journalId}`;
        const cachedResponse = await redis.get(cacheKey);
        if(cachedResponse){
            res.setHeader("Content-Type", "text/event-stream");
            res.write(`data: ${JSON.stringify({ token: cachedResponse })}\n\n`);
            res.write(`data: ${JSON.stringify({ token: "[DONE]" })}\n\n`);
            return res.end();
        }
    
        //mongo db local check 
        const entry=await journal_Model.findOne({_id:journalId,room :roomId});
        if (!entry) {
            res.setHeader("Content-Type", "text/event-stream");
            res.write(`data: ${JSON.stringify({ error: "entry not found " })}\n\n`);
            return res.end();
        }
        if (entry.aiResponse) {
            
            // Re-hydrate the Redis cache aside layer (24 hours TTL)
            await redis.set(cacheKey, entry.aiResponse, "EX", 86400);

            res.setHeader("Content-Type", "text/event-stream");
            res.write(`data: ${JSON.stringify({ token: entry.aiResponse })}\n\n`);
            res.write(`data: ${JSON.stringify({ token: "[DONE]" })}\n\n`);
            return res.end();
        }
 
        const currentVector =entry.embedding;
        const pineconeRes = await pineconeIndex.query({
            vector: currentVector,
            topK: 3, // Request 3 in case the current entry itself appears in the results
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

        const stream=await getAIFeedback(entry.content,pastEntries);

        //this is how stream flow works
        let fullResponse = "";

        // 2. Iterate through the stream chunks
        for await (const chunk of stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        // SSE format requires "data: " prefix and double newline
        res.write(`data: ${JSON.stringify({ token: chunkText })}\n\n`);
        }

        // 3. Save the full accumulated string to MongoDB
        entry.aiResponse = fullResponse;
        await entry.save();
        await redis.set(cacheKey, fullResponse, "EX", 86400);
        pineconeIndex.update({
            id: journalId.toString(),
            metadata: { 
                roomId: roomId.toString(),
                authorId: entry.author.toString(),
                content: entry.content,
                aiResponse: fullResponse 
            }
        }).catch(err => console.error("⚠️ Background Pinecone Metadata Update Failed:", err));
        // 4. Signal completion
        res.write(`data: ${JSON.stringify({ token: "[DONE]" })}\n\n`);
        res.end();

    }
    catch(err){
        console.error("Streaming Error:", err);
        res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
        res.end();
    }
}
const manageReaction=async(req,res,next)=>{
    const{journalId}=req.params;
    const {emoji}=req.body;
    const userId=req.user.id;
    try{
        const entry = await journal_Model.findById(journalId);
        if(!entry)return res.status(404).json({ message: "Insufficient" });
        const reactionGroup=entry.reaction.find(r=> r.emoji===emoji);
        if(reactionGroup){
            const userIndex = reactionGroup.users.indexOf(userId);
            if(userIndex>-1){
                await journal_Model.updateOne(
                { _id: journalId, "reaction.emoji": emoji },
                { $pull: { "reaction.$.users": userId } }
                );
            }
            else {
                // User hasn't reacted -> ADD
                await journal_Model.updateOne(
                   { _id: journalId, "reaction.emoji": emoji },
                    { $addToSet: { "reaction.$.users": userId } } 
                );
            }
        }
        else {
            // Emoji group doesn't exist -> CREATE NEW GROUP
            await journal_Model.findByIdAndUpdate(journalId, {
                $push: { reaction: { emoji, users: [userId] } }
            });
        }
        const updatedEntry = await journal_Model.findById(journalId).select("reaction");
    
        // BROADCAST via Socket
        getIO().to(entry.room.toString()).emit("reaction_journal", {
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
export { createEntries, displayEntries,updateEntries,deleteEntries,aiResponses,manageReaction};
