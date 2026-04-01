import room_Model from "../model/room.model.js";
import { nanoid } from "nanoid";
const create = async (req, res, next) => {
    try {
        const { name, description, isPrivate } = req.body;
        // console.log(typeof isPrivate);
        //issue in setting private 
        if (!name) return res.status(400).json({ message: "incomplete information" });
        const roomExist = await room_Model.findOne({ name: name });
        if (roomExist) return res.status(405).json({ message: "room already exists" });
        const { id } = req.user;
        const room = new room_Model({
            name: name,
            owner: id,
            description: description,
            isPrivate: false,
            inviteCode: nanoid(10),
        })
        room.members.push(id);
        await room.save();
        return res.status(200).json({ message: "room created" });
    }
    catch (err) {
        console.log("room creation failed");
        next(err);
    }
}
const join = async (req, res, next) => {
    try {
        const { inviteCode } = req.body;
        if (!inviteCode) return res.status(401).json({ message: "invite Code is missing" });
        const room = await room_Model.findOne({ inviteCode: inviteCode });
        if (!room) return res.status(404).json({ message: "Room not found , invalid invite code" });
        if (room.isPrivate) return res.status(404).json({ message: "room is private" });
        const { username, id } = req.user;
        if (room.members.some(member => member.equals(id))) return res.status(405).json({ message: `${username} already exists` });
        room.members.push(id);
        await room.save();
        return res.status(404).json({ message: `${username} joined the room` });
    }
    catch (err) {
        res.status(400).json({ message: err })
    }
}
const remove = async (req, res, next) => {
    try {
        const { name } = req.params;
        const { id } = req.user;
        const match_room = await room_Model.findOne({ name: name, owner: id });
        if (!match_room) return res.status(404).json({ message: "room not found or you are not authorised to delete the room" });
        await room_Model.deleteOne({ _id: match_room._id });
        return res.status(200).json({ message: "room deleted sucessfully" });
    }
    catch (err) {
        console.log("something is wrong in remove ", err);
        next(err);
    }
}
export { create, join, remove };