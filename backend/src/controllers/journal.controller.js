import room_Model from "../model/room.model.js";
import journal_Model from "../model/journal.model.js";
const createEntries = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { id } = req.user;
        const { content } = req.body;
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
        return res.send(journal);
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

export { createEntries, displayEntries };