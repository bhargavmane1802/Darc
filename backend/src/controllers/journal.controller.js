import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
const createEntries = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { id } = req.user;
        const {content} = req.body;
        if (!id || !content) return res.status(400).json({ message: "insufficient information" });
        const journalEntry = new journal_Model({
            author: id,
            room: roomId,
            content: content,
        })
        await journalEntry.save();
        res.status(200).json({ message: "entry saved" });
    }
    catch (err) {
        next(err);
    }
}
const displayEntries = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const journal = await journal_Model.find({ room: roomId });
        const journal_content= journal.map((entry)=>{
            return entry.content;
        })
        return res.send(journal_content);
        //pagation
        // 10 in one page
        // totalpages=(total journal entries/10 )+1;
        // index based on page=(page no *10)+i (i lies form 1 to 10);
        // do pagation in forntend 
    }
    catch (err) {
        return next(err);
    }
}
const updateEntries = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, journalId } = req.params;
        const journal = await journal_Model.findOne({ _id: journalId, author: id });
        if (!journal) return res.status(403).json({ message: "the does not exists or u are not the sender" });
        const { content} = req.body;
        if(!content)return res.status(400).json({message:"empty fields "});
        if (content) journal.content = content;
        await journal.save();
        res.status(201).json({ message: "journal updated" });
    }
    catch (err) {
        next(err);
    }
}
const deleteEntries = async (req, res, next) => {
    try {
        const { id } = req.user;
        const { roomId, journalId } = req.params;
        const journal = await journal_Model.findOne({ _id: journalId, author: id });
        if (!journal) return res.status(403).json({ message: "the message does not exists or u are not the sender" });
        const response = await journal_Model.deleteOne({ _id: journalId });
        console.log(response);
        res.status(201).json({ message: "journal deleted" });
    }
    catch (err) {
        next(err);
    }
}
export { createEntries, displayEntries,updateEntries,deleteEntries };