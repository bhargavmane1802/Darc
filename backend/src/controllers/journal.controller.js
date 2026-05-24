import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
import {getIO} from "../sockets/socket.js"
import { getAIFeedback } from "../services/ai.service.js";
import message_Model from "../model/message.model.js";

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
        await journal.save();
        await journal.populate("author", "username");
        const io=getIO();
        io.to(roomId).emit("create_journal",journal);
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
        const journal = await journal_Model.find({ room: roomId }).populate("author","username");
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
        const journal = await journal_Model.findOne({ _id: journalId, author: id });
        if (!journal) return res.status(403).json({ message: "Unauthorized" });
        const response = await journal_Model.deleteOne({ _id: journalId });
        console.log(response);
        const io = getIO();
        io.to(roomId).emit("delete_journal",{entry_id:journalId});
        res.status(200).json({ message: "journal deleted" });
    }
    catch (err) {
        console.log("Failed to delete journal entry");
        err.message="Failed deleteEntries";
        next(err);
    }
}
const aiResponses=async(req,res,next)=>{
    try{
        const {id}=req.user;
        const {roomId,journalId}=req.params;

        // 1. Setup SSE Headers headers needed for stream
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders(); // Send headers immediately

        const entry=await journal_Model.findOne({_id:journalId});
        if (!entry) {
            res.write(`data: ${JSON.stringify({ error: "entry not found " })}\n\n`);
res.end();
return;
        }
        const pastEntry=(await journal_Model.find({ room:roomId,author:entry.author}).sort({createdAt:-1}).limit(5));
        const stream=await getAIFeedback(entry.content,pastEntry);

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